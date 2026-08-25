import { NextRequest, NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/helpers';
import { userRepository } from '@/lib/db/repositories/user.repository';

export const maxDuration = 60;

const PHOTO_LIMIT = 2;

// 火山引擎 doubao-seedream 支持的尺寸（已实测验证）
const SIZE_MAP: Record<string, string> = {
  '1:1': '2k', // 2048x2048
  '3:4': '1728x2304',
  '2:3': '2048x3072',
  '4:3': '3072x2048',
  '16:9': '3072x1728',
};

// 背景二选一：白底 / 蓝底（模板中以 __BACKGROUND__ 占位，服务端按用户选择注入）
const BACKGROUND_MAP: Record<string, string> = {
  white: `### 白底版本
纯白色 / 柔和白色证件照背景，接近 #FFFFFF。背景必须干净、平整、无纹理、无物体、无场景、无明显渐变。允许非常轻微自然光造成的空间亮度变化，但整体仍必须被识别为标准白底证件照。`,
  blue: `### 蓝底版本
标准明亮蓝色背景，接近 #438EDB / #3D8EDB。蓝色清爽、明亮、干净。不要深蓝、不要藏青、不要青绿色、不要蓝紫色。背景保持均匀、纯净，允许非常轻微自然明暗变化，但不能出现明显渐变光斑。`,
};

export async function POST(request: NextRequest) {
  try {
    const user = await resolveUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const settings = await userRepository.getSettings(user.id);
    const used = Number(settings.photoGenCount) || 0;
    if (used >= PHOTO_LIMIT) {
      return NextResponse.json({ error: 'photo_limit_reached' }, { status: 429 });
    }

    const { image, prompt, requirements, aspectRatio, background } =
      await request.json();

    // 平台统一配置（服务端 .env），用户无需填写任何 Key
    const apiKey = process.env.ARK_API_KEY || '';
    const baseUrl =
      process.env.ARK_IMAGE_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
    const model = process.env.ARK_IMAGE_MODEL || 'doubao-seedream-5-0-260128';
    const watermark = process.env.ARK_IMAGE_WATERMARK !== 'false';

    if (!apiKey) {
      return NextResponse.json(
        { error: 'ARK API Key is not configured. Set ARK_API_KEY in .env.' },
        { status: 500 }
      );
    }

    if (!image || typeof image !== 'string') {
      return NextResponse.json(
        { error: 'Image is required' },
        { status: 400 }
      );
    }

    // Build final prompt: 强制身份保持（始终以参考照片中的人物为准）+ 用户提示词 + 额外要求
    const IDENTITY_GUARD =
      '以参考照片中的人物为唯一对象，严格保持其五官、脸型、发型、肤色与神态完全一致，不得改变人物长相与年龄。';
    // 画幅描述随所选生成尺寸动态变化（提示词中以 __ASPECT_RATIO__ 占位，避开 next-intl ICU 语法）
    const hasCJK = /[\u4e00-\u9fff]/.test(prompt);
    const ratioText =
      aspectRatio === '16:9'
        ? hasCJK
          ? '16:9电影宽银幕（强制）'
          : '16:9 widescreen (mandatory)'
        : hasCJK
          ? `${aspectRatio}比例`
          : `${aspectRatio} aspect ratio`;
    let finalPrompt = `${IDENTITY_GUARD}\n${prompt}`
      .replaceAll('__ASPECT_RATIO__', ratioText)
      .replaceAll('__BACKGROUND__', BACKGROUND_MAP[background] || BACKGROUND_MAP.white);
    if (requirements) {
      finalPrompt += `\n\nAdditional requirements: ${requirements}`;
    }

    // Map aspect ratio to a supported ARK size
    const size = SIZE_MAP[aspectRatio] || '2k';

    const res = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt: finalPrompt,
        // 上传的自拍图作为参考图（dataURL 或 URL 均可）
        image,
        sequential_image_generation: 'disabled',
        response_format: 'url',
        size,
        stream: false,
        watermark,
        // 无损 PNG 输出，避免 ARK 默认高压缩 JPEG 导致图片模糊
        output_format: 'png',
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('ARK image API error:', res.status, errBody);

      if (res.status === 429) {
        return NextResponse.json(
          { error: 'quota_exceeded', detail: errBody },
          { status: 429 }
        );
      }

      // 余额不足 / 配额限制通常以 400 + balance/quota 提示返回
      if (res.status === 400 || res.status === 403) {
        const lower = errBody.toLowerCase();
        if (
          lower.includes('balance') ||
          lower.includes('quota') ||
          lower.includes('insufficient')
        ) {
          return NextResponse.json(
            { error: 'quota_exceeded', detail: errBody },
            { status: 429 }
          );
        }
        return NextResponse.json(
          { error: 'invalid_key', detail: errBody },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'generate_failed', detail: errBody },
        { status: res.status }
      );
    }

    const data = await res.json();
    const imageUrl = data?.data?.[0]?.url;

    if (!imageUrl) {
      console.error('ARK no image url in response:', JSON.stringify(data).slice(0, 500));
      return NextResponse.json(
        { error: 'generate_failed', detail: 'No image in response' },
        { status: 500 }
      );
    }

    // 下载生成图片并转成 base64 dataURL，保持与前端一致（可直接展示 / 设为头像）
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      console.error('Failed to download ARK image:', imgRes.status);
      return NextResponse.json(
        { error: 'generate_failed', detail: 'Failed to download image' },
        { status: 500 }
      );
    }
    const imgBuf = Buffer.from(await imgRes.arrayBuffer());
    const mimeType =
      imgRes.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
    const resultImage = `data:${mimeType};base64,${imgBuf.toString('base64')}`;

    await userRepository.updateSettings(user.id, { photoGenCount: used + 1 });
    return NextResponse.json({
      image: resultImage,
      remaining: PHOTO_LIMIT - used - 1,
    });
  } catch (err) {
    console.error('LinkedIn photo generation error:', err);
    return NextResponse.json(
      { error: 'generate_failed', detail: String(err) },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await resolveUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const settings = await userRepository.getSettings(user.id);
    const used = Number(settings.photoGenCount) || 0;
    return NextResponse.json({ limit: PHOTO_LIMIT, used, remaining: Math.max(0, PHOTO_LIMIT - used) });
  } catch (err) {
    console.error('linkedin-photo quota error:', err);
    return NextResponse.json({ error: 'generate_failed' }, { status: 500 });
  }
}
