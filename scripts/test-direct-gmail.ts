import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function testDirect() {
  const user = "n7842165@gmail.com";
  const pass = "vituotqpcmduwxwd"; // No spaces
  
  console.log(`Testing Gmail Direct: ${user} / ${pass}`);

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user, pass },
  });

  try {
    const info = await transporter.sendMail({
      from: `"JV Tutor Test" <${user}>`,
      to: "admin@jvtutorcorner.com",
      subject: "Direct Test",
      text: "Hello from direct test",
    });
    console.log("✅ Success! MessageId:", info.messageId);
  } catch (err: any) {
    console.error("❌ Failed:", err.message);
  }
}

testDirect();
