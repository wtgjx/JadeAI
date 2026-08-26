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

export async function sendVerificationCodeMail(to: string, code: string): Promise<void> {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await getTransport().sendMail({
    from,
    to,
    subject: '职爪 - 邮箱验证码',
    text: `你的验证码是 ${code}，10 分钟内有效。请勿泄露给他人。`,
    html: `<p>你的验证码是 <strong style="font-size:20px;letter-spacing:2px">${code}</strong>，10 分钟内有效。请勿泄露给他人。</p>`,
  });
}
