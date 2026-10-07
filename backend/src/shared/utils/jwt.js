import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '../config/env.js';

/**
 * `jsonwebtoken` types `expiresIn` as a number of seconds or a template
 * literal such as `15m`. The value arrives from the environment as a plain
 * string, so it is narrowed here rather than widening the config type to
 * `any`; an unparseable duration is rejected by the library at signing time.
 */
const asExpiry = (value)['expiresIn'] => value 'expiresIn'];

export class JwtService {
 static signAccessToken(payload) {
 return jwt.sign(payload, config.jwt.accessSecret, {
 expiresIn: asExpiry(config.jwt.accessExpiresIn),
 });
 }

 static signRefreshToken(payload) {
 return jwt.sign(payload, config.jwt.refreshSecret, {
 expiresIn: asExpiry(config.jwt.refreshExpiresIn),
 });
 }

 static verifyAccessToken(token) {
 return jwt.verify(token, config.jwt.accessSecret) ;
 }

 static verifyRefreshToken(token) {
 return jwt.verify(token, config.jwt.refreshSecret) ;
 }
}
