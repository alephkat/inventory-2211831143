import bcrypt from 'bcrypt';
import { config } from '../config/env';

export class PasswordService {
  static async hash(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(config.bcrypt.saltRounds);
    return bcrypt.hash(password, salt);
  }

  static async compare(
    password: string,
    hash: string,
  ): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
