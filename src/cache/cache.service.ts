import { Injectable } from '@nestjs/common';
import * as NodeCache from 'node-cache';
@Injectable()
export class CacheService {
  constructor() {
    this.myCache = new NodeCache({ maxKeys: 100 });
    this.ttl = 60;
  }
  myCache: NodeCache = null;
  ttl: number;

  set(key: string, value: any) {
    this.myCache.set(key, value, this.ttl);
  }

  mset(data: { key: string; val: any }[]) {
    this.myCache.mset(data);
  }

  get(key: string) {
    return this.myCache.get(key);
  }

  mget(keys: string[]) {
    return this.myCache.mget(keys);
  }

  del(key: string) {
    this.myCache.del(key);
  }
}
