/**
 * Makes an account a game master, or takes that away again:
 *   npm run admin -- <name>          make admin
 *   npm run admin -- <name> off      back to a normal player
 *   npm run admin                    list admins
 * Takes effect the next time that character logs in.
 */
import { listAdmins, setAdmin } from "../src/db";

const args = process.argv.slice(2);
const off = args.length > 1 && args[args.length - 1] === "off";
const name = (off ? args.slice(0, -1) : args).join(" ").trim();

if (!name) {
  const admins = await listAdmins();
  console.log(admins.length ? `แอดมิน: ${admins.join(", ")}` : "ยังไม่มีแอดมิน ใช้: npm run admin -- <ชื่อตัวละคร>");
} else if (await setAdmin(name, !off)) {
  console.log(off ? `${name} ไม่เป็นแอดมินแล้ว` : `${name} เป็นแอดมินแล้ว เข้าเกมใหม่อีกครั้งเพื่อเริ่มใช้`);
} else {
  console.log(`ไม่พบตัวละครชื่อ ${name}`);
  process.exitCode = 1;
}
