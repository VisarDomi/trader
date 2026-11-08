import{test,expect}from'bun:test';
import{replayWindow}from'./replay-coverage';
import{replayData}from'./tick-tape';
test('an early-ending tape preserves requested bounds and exposes its actual input end',()=>{
 const start=Date.UTC(2026,9,14),end=Date.UTC(2026,10,7),last=Date.UTC(2026,9,20,23,59,59,999);
 const w=replayWindow(start,end,start,last);expect(w.requestedEnd).toBe(end);expect(w.inputEnd).toBe(Date.UTC(2026,9,21));expect(w.trailingGapMs).toBe(17*86400000);expect(w.calendarVerified).toBe(false);
 expect(replayData().uncoveredMinutes).toBeNull();
});
test('empty input and a fully bounded input cannot fabricate verified calendar coverage',()=>{
 expect(replayWindow(0,120000,null,null)).toMatchObject({inputStart:null,inputEnd:null,trailingGapMs:null,calendarVerified:false});
 expect(replayWindow(0,120000,0,119999)).toMatchObject({inputEnd:120000,trailingGapMs:0,calendarVerified:false});
});
