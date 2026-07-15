import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import axios from 'axios';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ตั้งค่าสำหรับใช้งาน __dirname ใน ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ตรวจสอบและสร้างโฟลเดอร์สำหรับเก็บรูปสลิป
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

// ตั้งค่า Multer สำหรับบันทึกไฟล์สลิป
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// เปิดให้เข้าถึงไฟล์ในโฟลเดอร์ uploads และโฟลเดอร์หน้าบ้าน public
app.use('/uploads', express.static(uploadDir));
app.use(express.static(path.join(__dirname, 'public')));

//คลังเก็บข้อมูลคิวชั่วคราวใน RAM
let queues = [];
let queueCounter = 1;

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';

// ============ ROUTE สำหรับเปิดหน้าเว็บ ============
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ============ API ROUTES ============

// ดึงข้อมูลคิวทั้งหมด
app.get('/api/queues', (req, res) => {
  res.json({ queues });
});

// จองคิวใหม่ (รองรับการอัปโหลดไฟล์สลิป)
app.post('/api/book-queue', upload.single('slip'), (req, res) => {
  const { type, displayName, userId, pictureUrl, scheduledDate, scheduledTime, duration } = req.body;
  const slipFile = req.file;

  if (!displayName) {
    return res.status(400).json({ error: 'ไม่พบข้อมูลโปรไฟล์ LINE' });
  }
  if (!slipFile) {
    return res.status(400).json({ error: 'กรุณาอัปโหลดรูปภาพสลิปเงินโอน' });
  }

  const newQueue = {
    id: Date.now(),
    queueNumber: queueCounter++,
    displayName,
    userId: userId || null,
    pictureUrl: pictureUrl || null,
    type, 
    duration: duration || null,
    scheduledDate: scheduledDate || null,
    scheduledTime: scheduledTime || null,
    slipUrl: `/uploads/${slipFile.filename}`,
    status: 'waiting', 
    bookingTime: new Date(),
  };

  queues.push(newQueue);

  // ส่ง Push Message แจ้งเตือนลูกค้าผ่าน LINE ทันทีเมื่อจองเสร็จ
  if (LINE_CHANNEL_ACCESS_TOKEN && userId) {
    sendLinePushNotification(userId, `🎉 คุณ ${displayName} จองคิวสำเร็จแล้ว!\nคิวของคุณคือลำดับที่ ${newQueue.queueNumber}\nประเภท: ${type === 'phone' ? 'นัดหมายทางโทรศัพท์' : 'คิวพิมพ์ปกติ'}`);
  }

  res.json({ success: true, queue: newQueue });
});

// แอดมินเรียกคิว
app.post('/api/call-queue/:id', (req, res) => {
  const queue = queues.find(q => q.id === parseInt(req.params.id));
  if (!queue) {
    return res.status(404).json({ error: 'ไม่พบข้อมูลคิวดังกล่าว' });
  }

  queue.status = 'called';

  if (LINE_CHANNEL_ACCESS_TOKEN && queue.userId) {
    sendLinePushNotification(queue.userId, `📢 ถึงคิวลำดับที่ ${queue.queueNumber} ของคุณแล้วค่ะ! รบกวนเตรียมพร้อมรับคำทำนายได้เลยนะคะ 🔮`);
  }

  res.json({ success: true, queue });
});

// แอดมินปิดคิว
app.post('/api/complete-queue/:id', (req, res) => {
  const queue = queues.find(q => q.id === parseInt(req.params.id));
  if (!queue) {
    return res.status(404).json({ error: 'ไม่พบข้อมูลคิวดังกล่าว' });
  }

  queue.status = 'completed';

  if (LINE_CHANNEL_ACCESS_TOKEN && queue.userId) {
    sendLinePushNotification(queue.userId, `✅ คิวลำดับที่ ${queue.queueNumber} ได้รับการทำนายเสร็จสิ้นแล้ว ขอบพระคุณที่ใช้บริการณัฏฐ์ดวงดูค่ะ 🙏`);
  }

  res.json({ success: true, queue });
});

// ฟังก์ชันส่งข้อความหา LINE ส่วนบุคคล (Push Message)
async function sendLinePushNotification(toUserId, messageText) {
  try {
    await axios.post(
      'https://api.line.biz/v2/bot/message/push',
      { 
        to: toUserId,
        messages: [{ type: 'text', text: messageText }] 
      },
      {
        headers: {
          'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('LINE Push Error:', error.response ? error.response.data : error.message);
  }
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
