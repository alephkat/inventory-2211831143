import bcrypt from 'bcrypt';
import { config } from '../config/env.js';

export class PasswordService {
 static async hash(password) {
 const salt = await bcrypt.genSalt(config.bcrypt.saltRounds);
 return bcrypt.hash(password, salt);
 }

 static async compare(
 password,
 hash) {
 return bcrypt.compare(password, hash);
 }
}
