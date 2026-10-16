import {expect,test} from 'bun:test';
import {QuoteStream,type LiveQuote} from './stream.ts';
import {TICK_SOURCE} from '../engine/ticks.ts';
import type {CapitalClient} from '../capital/client.ts';
test('an invalid future/stale quote cannot poison the stream watermark or block subsequent fresh prices',()=>{
 const quotes:LiveQuote[]=[],t=Date.now();const stream=new QuoteStream({} as CapitalClient,['US500'],q=>quotes.push(q),()=>{});
 const send=(offset:number)=> (stream as any).handleQuote({epic:'US500',bid:100,ask:101,time:t+offset,receivedAt:t,source:TICK_SOURCE.LIVE});
 send(3600000);send(-60000);send(0);send(-1);send(0);
 expect(quotes).toHaveLength(2);expect(stream.lastQuote.get('US500')!.time).toBe(t);
});
