type Handle=ReturnType<typeof setTimeout>;
interface Clock {set(fn:()=>void,ms:number):Handle;clear(handle:Handle):void}
const clock:Clock={set:(fn,ms)=>setTimeout(fn,ms),clear:handle=>clearTimeout(handle)};

/** One refresh at a time; hidden tabs do no work, and an outage cannot strand the page. */
export class RefreshLoop {
  private active=false;
  private busy=false;
  private timer:Handle|null=null;
  constructor(private refresh:()=>Promise<unknown>,private recovering:()=>boolean,
    private visible:()=>boolean,private clock:Clock=clock) {}
  start(){this.active=true;this.schedule();}
  stop(){this.active=false;this.cancel();}
  wake(){if(!this.active||!this.visible())return;this.cancel();void this.run();}
  private cancel(){if(this.timer!==null)this.clock.clear(this.timer);this.timer=null;}
  private schedule(){
    if(!this.active||this.busy||!this.visible())return;
    this.cancel();this.timer=this.clock.set(()=>{this.timer=null;void this.run();},this.recovering()?5000:30000);
  }
  private async run(){
    if(!this.active||this.busy||!this.visible())return;
    this.busy=true;
    try{await this.refresh();}catch{/* Keep the current page and retry on the next interval. */}
    finally{this.busy=false;this.schedule();}
  }
}
