import type { ReplayDataInfo } from '@trader/shared';
const MINUTE=60_000;
/** Input endpoints are observable; missing market minutes require a verified market calendar. */
export function replayWindow(start:number,end:number,first:number|null,last:number|null):NonNullable<ReplayDataInfo['window']>{
  const through=last===null?null:Math.min(end,Math.floor(last/MINUTE)*MINUTE+MINUTE);
  return {requestedStart:start,requestedEnd:end,inputStart:first,inputEnd:through,
    trailingGapMs:through===null?null:Math.max(0,end-through),calendarVerified:false};
}
