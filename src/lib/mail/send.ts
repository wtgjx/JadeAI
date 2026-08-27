import nodemailer from 'nodemailer';

let transport: nodemailer.Transporter | null = null;

function getTransport(): nodemailer.Transporter {
  if (transport) return transport;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    throw new Error('SMTP_* environment variables are not configured');
  }
  transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return transport;
}

/** 邮件里引用的 GIF 动图（public/mail-welcome.gif，已改为播放一遍定格结尾帧） */
const WELCOME_GIF_URL = 'https://jd.wutongshuai.com/mail-welcome.gif';

export async function sendVerificationCodeMail(to: string, code: string): Promise<void> {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const codeSpaced = code.split('').join(' ');

  await getTransport().sendMail({
    from,
    to,
    subject: '欢迎来到职爪 · 你的验证码来了',
    text: `嗨，未来的同行。

欢迎来到职爪。我们做这个工具，是希望每一份认真准备的简历，都能被温柔以待。

你的验证码是：${codeSpaced}
（10 分钟内有效，请勿泄露给他人）

2027 届的你们，正走向人生第一份 Offer。这条路可能有点卷、有点慌，但我们相信——你写下的每一段经历，都值得被看见。

愿你投出的每一份简历都有回音，愿每一场笔试都是你会做的题，愿你在这个秋招季，拿到心仪的 Offer。

—— 职爪开发者 · 为 27 届的你加油`,
    html: `
      <div style="max-width:520px;margin:0 auto;padding:24px;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#20201f;line-height:1.7;">
        <img src="${WELCOME_GIF_URL}" width="240" height="320" alt="职爪欢迎你" style="display:block;width:240px;max-width:100%;margin:0 auto 20px;border-radius:12px;" />

        <h1 style="font-size:20px;margin:0 0 10px;text-align:center;color:#20201f;">欢迎来到职爪</h1>
        <p style="font-size:14px;color:#4e4c48;text-align:center;margin:0;">嗨，未来的同行，很高兴遇见你。</p>

        <div style="background:#f5f2ec;border-radius:14px;padding:22px;margin:22px 0;text-align:center;">
          <p style="font-size:13px;color:#716e68;margin:0 0 12px;">你的验证码是</p>
          <div style="font-size:34px;font-weight:700;letter-spacing:8px;color:#b64220;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;line-height:1.3;">${code}</div>
          <p style="font-size:12px;color:#a09c94;margin:14px 0 0;">10 分钟内有效 · 长按或选中上方验证码即可复制</p>
        </div>

        <div style="font-size:14px;color:#4e4c48;text-align:center;line-height:2;">
          <p style="margin:0;">2027 届的你们，正走向人生第一份 Offer。</p>
          <p style="margin:0;">这条路可能有点卷、有点慌，</p>
          <p style="margin:0;">但我们相信——你写下的每一段经历，都值得被看见。</p>
          <p style="margin:14px 0 0;">愿你投出的每一份简历都有回音，<br/>愿每一场笔试都是你会做的题，<br/>愿你在这个秋招季，拿到心仪的 Offer。</p>
        </div>

        <p style="font-size:12px;color:#a09c94;text-align:center;margin:24px 0 0;">—— 职爪开发者 · 为 27 届的你加油</p>
      </div>
    `,
  });
}
