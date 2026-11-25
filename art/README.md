# ภาพจาก Blender

โมเดลทั้งหมดสร้างจากสคริปต์ จึงแก้สี ทรง หรือท่าทาง แล้วเรนเดอร์ใหม่ได้ทุกเมื่อ (ใช้ Blender 5.3)

- `kit.py` วัสดุการ์ตูน เส้นขอบ กล้องมุมเฉียงของเกม และการต่อภาพเป็นแผ่น
- `player.py` ตัวละคร 5 ชั้น: ตัว เสื้อ (ย้อมสีในเกม) หมวก ดาบ ขวาน
- `monsters.py` มอนสเตอร์ 7 ชนิด

เรนเดอร์ใหม่ (รันในโฟลเดอร์โปรเจกต์):

```powershell
& "C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" --background --factory-startup --python art/player.py -- client/public/art
& "C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" --background --factory-startup --python art/monsters.py -- client/public/art
```

เติม `preview` ท้ายคำสั่งเพื่อดูภาพตัวอย่างใหญ่ หรือเติมชื่อมอนสเตอร์ เช่น `hen` เพื่อเรนเดอร์เฉพาะตัวนั้น

แต่ละแผ่นมี 8 แถว (ทิศ 0 = หันหาเรา แล้วหมุนตามเข็ม) ถ้าเปลี่ยนขนาดเฟรมหรือกล้อง ให้แก้ตัวเลขใน `client/src/sprites.ts` ด้วย
