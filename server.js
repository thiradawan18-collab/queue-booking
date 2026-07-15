import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// In-memory storage (คลังเก็บข้อมูลคิวชั่วคราว)
let queues = [];
let queueCounter = 1;

// LINE Configuration
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';

// 1. ดึงข้อมูลคิวทั้งหมดไปโชว์หน้าเว็บ
app.get('/api/queues', (req, res) => {
  res.json({ queues });
});

// 2. รับจองคิวใหม่จากหน้าบ้าน
app.post('/api/book-queue', (req, res) => {
  const { displayName, userId, type, scheduledDate, scheduledTime, duration } = req.body;

  if (!displayName) {
    return res.status(400).json({ error: 'ไม่พบชื่อผู้ใช้งาน LINE' });
  }

  const newQueue = {
    id: queueCounter++,
    queueNumber: queues.length + 1,
    displayName,
    userId,
    type, // 'walkin' หรือ 'phone'
    scheduledDate: scheduledDate || '-',
    scheduledTime: scheduledTime || '-',
    duration: duration || '-',
    status: 'waiting', // waiting (รอ), called (เรียกแล้ว), completed (เสร็จสิ้น)
    bookingTime: new Date(),
  };

  queues.push(newQueue);

  // ส่งแจ้งเตือนเข้า LINE OA ร้านค้าทันทีที่มีคนจอง
  if (LINE_CHANNEL_ACCESS_TOKEN) {
    const typeText = type === 'walkin' ? 'พิมพ์คุย (ปกติ)' : 'โทรคุย (นัดเวลา)';
    sendLineNotification(`📢 มีการจองคิวใหม่เข้ามา!\n👤 คุณ: ${displayName}\n🎫 คิวลำดับที่: ${newQueue.queueNumber}\n📦 ประเภท: ${typeText}\n⏰ เวลานัด: ${newQueue.scheduledDate} พ้นเวลา ${newQueue.scheduledTime}`);
  }

  res.json({ success: true, queue: newQueue });
});

// 3. ปุ่มกดเรียกคิว (สำหรับแอดมิน)
app.post('/api/call-queue/:id', (req, res) => {
  const queue = queues.find(q => q.id === parseInt(req.params.id));
  if (!queue) {
    return res.status(404).json({ error: 'ไม่พบข้อมูลคิวนี้' });
  }

  queue.status = 'called';

  // แจ้งเตือนบอกลูกค้าผ่าน LINE OA
  if (LINE_CHANNEL_ACCESS_TOKEN) {
    sendLineNotification(`📢 ถึงคิวของคุณแล้วครับ!\n🎫 ลำดับคิวที่: ${queue.queueNumber} (${queue.displayName})\n🔮 แอดมินเรียกพบ โปรดเตรียมตัวเข้าดูดวงได้เลยครับ`);
  }

  res.json({ success: true, queue });
});

// 4. ปุ่มกดปิดคิวเมื่อดูเสร็จ (สำหรับแอดมิน)
app.post('/api/complete-queue/:id', (req, res) => {
  const queue = queues.find(q => q.id === parseInt(req.params.id));
  if (!queue) {
    return res.status(404).json({ error: 'ไม่พบข้อมูลคิวนี้' });
  }

  queue.status = 'completed';

  if (LINE_CHANNEL_ACCESS_TOKEN) {
    sendLineNotification(`✅ คิวที่ ${queue.queueNumber} (${queue.displayName}) ทำรายการเสร็จสิ้น\n🙏 ขอบพระคุณที่เลือกดูดวงกับณัฏฐ์ดวงดูครับ ขอให้เฮง ๆ รวย ๆ ครับ`);
  }

  res.json({ success: true, queue });
});

// ฟังก์ชันส่งบรอดแคสต์แจ้งเตือนเข้า LINE
async function sendLineNotification(message) {
  try {
    await axios.post(
      'https://api.line.biz/v2/bot/message/broadcast',
      { messages: [{ type: 'text', text: message }] },
      {
        headers: {
          'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Error sending LINE notification:', error.message);
  }
}

// ตรวจสอบสถานะระบบ
app.get('/', (req, res) => {
  res.json({ status: 'เซิร์ฟเวอร์ระบบจองคิวพร้อมทำงาน 100%' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
