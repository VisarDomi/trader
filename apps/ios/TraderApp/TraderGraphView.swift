import UIKit

/** Draws one server-built chart: lines, a bid/ask price band, candles, horizontal guides (stops, loss levels) and markers. */
@MainActor
final class TraderGraphView:UIView,UIGestureRecognizerDelegate {
    var graph=Graph(){didSet{probe=nil;setNeedsDisplay();accessibilityLabel=graph.kind=="price" ? "Bid and ask price chart with open and close markers":graph.kind=="waterfall" ? "Trade cost breakdown":graph.series.map(\.name).joined(separator:", ")+" chart"}}
    private var probe:CGFloat?
    private let font=UIFont.monospacedDigitSystemFont(ofSize:10,weight:.regular)
    override init(frame:CGRect){
        super.init(frame:frame);contentMode = .redraw;isOpaque=false;backgroundColor = .clear;isAccessibilityElement=true
        let pan=UIPanGestureRecognizer(target:self,action:#selector(scrub(_:)));pan.delegate=self;addGestureRecognizer(pan)
        addGestureRecognizer(UITapGestureRecognizer(target:self,action:#selector(scrub(_:))))
    }
    required init?(coder:NSCoder){fatalError("init(coder:)")}
    override func gestureRecognizerShouldBegin(_ g:UIGestureRecognizer)->Bool{
        if graph.kind=="spark" || graph.kind=="meter" {return false}
        guard let pan=g as? UIPanGestureRecognizer else{return true};let v=pan.velocity(in:self);return abs(v.x)>abs(v.y)
    }
    @objc private func scrub(_ g:UIGestureRecognizer){probe=g.location(in:self).x;setNeedsDisplay()}
    private func text(_ value:String,x:CGFloat,y:CGFloat,color:UIColor = .secondaryLabel){(value as NSString).draw(at:CGPoint(x:x,y:y),withAttributes:[.font:font,.foregroundColor:color])}
    private func width(_ value:String)->CGFloat{(value as NSString).size(withAttributes:[.font:font]).width}
    private func formatted(_ value:Double)->String{value.formatted(.number.precision(.fractionLength(graph.precision)))}
    private let colors:[UIColor]=[.systemTeal,.systemOrange,.systemPurple,.systemBlue]
    private func toneColor(_ tone:Int,_ fallback:UIColor)->UIColor{tone>0 ? .systemGreen:tone<0 ? .systemRed:fallback}
    /** A series without times is evenly spaced over the graph's window. */
    private func times(_ s:GraphSeries)->[Double] {
        if !s.t.isEmpty {return s.t}
        guard let from=graph.from,let through=graph.through,s.v.count>1 else{return s.v.indices.map(Double.init)}
        return s.v.indices.map{from+(through-from)*Double($0)/Double(s.v.count-1)}
    }
    override func draw(_ rect:CGRect){
        guard let ctx=UIGraphicsGetCurrentContext()else{return}
        let spark=graph.kind=="spark"
        let box=spark ? rect.insetBy(dx:4,dy:6):CGRect(x:58,y:28,width:max(10,rect.width-66),height:max(10,rect.height-55))
        if graph.kind=="waterfall"{waterfall(ctx,box);return}
        if graph.kind=="bars"{bars(ctx,rect);return}
        if graph.kind=="meter"{meter(ctx,rect);return}
        let timed=graph.series.map{(times($0),$0.v)}
        let allTimes=timed.flatMap(\.0)+(graph.candles?.t ?? [])
        let first=graph.from ?? allTimes.min() ?? graph.markers.map(\.t).min() ?? 0,last=graph.through ?? allTimes.max() ?? graph.markers.map(\.t).max() ?? first+60000
        let span=max(1,last-first)
        let visibleMarkers=graph.markers.filter{$0.t>=first-1 && $0.t<=last+1}
        let c=graph.candles
        var values=timed.flatMap(\.1).filter(\.isFinite)+visibleMarkers.compactMap(\.value)+graph.guides.map(\.value)
        if let c {values+=c.low+c.high}
        guard let minimum=values.min(),let maximum=values.max()else{if !spark{text("No price history",x:box.minX,y:box.midY)};return}
        let pad=max((maximum-minimum)*0.08,max(abs(maximum)*0.00001,0.000001)),lo=minimum-pad,hi=maximum+pad
        let x:(Double)->CGFloat={box.minX+box.width*CGFloat(($0-first)/span)}
        let y:(Double)->CGFloat={box.maxY-box.height*CGFloat(($0-lo)/(hi-lo))}
        if !spark {
            ctx.setLineWidth(0.5);ctx.setStrokeColor(UIColor.separator.cgColor)
            for i in 0...3{let yy=box.minY+box.height*CGFloat(i)/3;ctx.move(to:CGPoint(x:box.minX,y:yy));ctx.addLine(to:CGPoint(x:box.maxX,y:yy));text(formatted(hi-(hi-lo)*Double(i)/3),x:0,y:yy-6)};ctx.strokePath()
        }
        if graph.kind=="price",timed.count>=2,timed[0].1.count>1,timed[0].1.count==timed[1].1.count {
            let band=UIBezierPath(),(bt,bv)=timed[0],(at,av)=timed[1]
            for i in bv.indices{let p=CGPoint(x:x(bt[i]),y:y(bv[i]));i==0 ? band.move(to:p):band.addLine(to:p)}
            for i in av.indices.reversed(){band.addLine(to:CGPoint(x:x(at[i]),y:y(av[i])))};band.close();UIColor.systemTeal.withAlphaComponent(0.10).setFill();band.fill()
        }
        for gap in graph.gaps where gap.through>=first && gap.from<=last {
            let left=x(max(first,gap.from)),right=x(min(last,gap.through));UIColor.tertiarySystemFill.setFill();ctx.fill(CGRect(x:left,y:box.minY,width:max(1,right-left),height:box.height))
        }
        if let c {
            let w=max(1,min(5,box.width/CGFloat(max(1,c.count))*0.5))
            for i in 0..<c.count where c.t[i]>=first && c.t[i]<=last {
                let xx=x(c.t[i]);ctx.setStrokeColor(UIColor.tertiaryLabel.cgColor);ctx.setLineWidth(1)
                ctx.move(to:CGPoint(x:xx,y:y(c.high[i])));ctx.addLine(to:CGPoint(x:xx,y:y(c.low[i])));ctx.strokePath()
                ctx.setFillColor(UIColor.secondaryLabel.withAlphaComponent(0.4).cgColor);ctx.fill(CGRect(x:xx-w/2,y:min(y(c.open[i]),y(c.close[i])),width:w,height:max(1,abs(y(c.open[i])-y(c.close[i])))))
            }
        }
        for guide in graph.guides {
            let color=toneColor(guide.tone,.secondaryLabel),yy=y(guide.value)
            ctx.saveGState();ctx.setStrokeColor(color.withAlphaComponent(0.7).cgColor);ctx.setLineWidth(1);ctx.setLineDash(phase:0,lengths:[5,4]);ctx.move(to:CGPoint(x:box.minX,y:yy));ctx.addLine(to:CGPoint(x:box.maxX,y:yy));ctx.strokePath();ctx.restoreGState()
            if !spark {let w=width(guide.label);text(guide.label,x:box.maxX-w,y:yy-13,color:color)}
        }
        for (i,(ts,vs)) in timed.enumerated() {
            let path=UIBezierPath();var open=false,previous:Double?
            for j in vs.indices {
                guard vs[j].isFinite else{open=false;continue}
                let point=CGPoint(x:x(ts[j]),y:y(vs[j]))
                let gap=previous.map{before in graph.gaps.contains{$0.from<ts[j] && $0.through>before}} ?? false
                if !open || gap {path.move(to:point);open=true}else{path.addLine(to:point)};previous=ts[j]
            }
            colors[i%colors.count].setStroke();path.lineWidth=spark ? 1.4:1.6;path.stroke()
        }
        for m in visibleMarkers {
            let demo=m.label.hasPrefix("DEMO"),xx=x(m.t)
            let color:UIColor=demo ? .systemOrange:m.label=="OPEN" || m.label.isEmpty && m.t==visibleMarkers.first?.t ? .systemBlue:toneColor(m.tone,.systemGreen)
            if !spark {ctx.saveGState();ctx.setStrokeColor(color.withAlphaComponent(0.5).cgColor);ctx.setLineDash(phase:0,lengths:[3,3]);ctx.move(to:CGPoint(x:xx,y:box.minY));ctx.addLine(to:CGPoint(x:xx,y:box.maxY));ctx.strokePath();ctx.restoreGState()}
            if let value=m.value {let r:CGFloat=spark ? 3:4;color.setFill();ctx.fillEllipse(in:CGRect(x:xx-r,y:y(value)-r,width:2*r,height:2*r))}
            if !spark && !m.label.isEmpty {let w=width(m.label);text(m.label,x:min(box.maxX-w,max(box.minX,xx-w/2)),y:demo ? box.maxY-13:box.minY-15,color:color)}
        }
        if spark {return}
        for(i,t)in [first,(first+last)/2,last].enumerated(){let label=Date(timeIntervalSince1970:t/1000).formatted(span>172800000 ? .dateTime.month(.abbreviated).day():.dateTime.hour().minute());let w=width(label);let xx=i==0 ? box.minX:i==2 ? box.maxX-w:box.midX-w/2;text(label,x:xx,y:box.maxY+8)}
        if let probe {
            let xx=min(box.maxX,max(box.minX,probe)),at=first+Double((xx-box.minX)/box.width)*span
            ctx.setStrokeColor(UIColor.label.withAlphaComponent(0.5).cgColor);ctx.move(to:CGPoint(x:xx,y:box.minY));ctx.addLine(to:CGPoint(x:xx,y:box.maxY));ctx.strokePath()
            var labels=[Date(timeIntervalSince1970:at/1000).formatted(.dateTime.hour().minute().second())]
            let inGap=graph.gaps.contains{$0.from<=at && $0.through>=at}
            if !inGap {for (s,(ts,vs)) in zip(graph.series,timed) {if let j=ts.indices.min(by:{abs(ts[$0]-at)<abs(ts[$1]-at)}),vs[j].isFinite{labels.append(s.name+" "+formatted(vs[j]))}}}
            else {labels.append("No recorded quotes")}
            text(labels.joined(separator:" · "),x:box.minX,y:0,color:.label)
        }else{text((graph.series.contains{!$0.v.isEmpty} ? graph.series.filter{!$0.v.isEmpty}.map(\.name).joined(separator:" / "):"Minute candles")+(graph.unit.isEmpty ? "":" · "+graph.unit),x:box.minX,y:0)}
    }
    private func bars(_ ctx:CGContext,_ rect:CGRect){
        let box=CGRect(x:90,y:8,width:max(10,rect.width-158),height:max(10,rect.height-16)),maximum=max(0.001,graph.bars.map{abs($0.value)}.max() ?? 1)
        let step=box.height/CGFloat(max(1,graph.bars.count)),zero=box.midX
        ctx.setStrokeColor(UIColor.separator.cgColor);ctx.move(to:CGPoint(x:zero,y:box.minY));ctx.addLine(to:CGPoint(x:zero,y:box.maxY));ctx.strokePath()
        for(i,b)in graph.bars.enumerated(){let yy=box.minY+CGFloat(i)*step,ww=box.width/2*CGFloat(abs(b.value)/maximum)
            text(b.name,x:0,y:yy+step/2-6);(b.value<0 ? UIColor.systemRed:UIColor.systemTeal).withAlphaComponent(0.8).setFill();ctx.fill(CGRect(x:b.value<0 ? zero-ww:zero,y:yy+step*0.25,width:ww,height:max(2,step*0.5)))
            text(b.value.formatted(.number.precision(.fractionLength(1)))+graph.unit,x:box.maxX+8,y:yy+step/2-6,color:.label)
        }
    }
    private func meter(_ ctx:CGContext,_ rect:CGRect){
        guard let m=graph.meter else{return}
        let span=max(abs(m.limit)*(m.price ? 0.001:0.5),abs(m.value-m.limit)*1.6,m.limit==0 ? 1:0.000001),left:CGFloat=4,width=max(10,rect.width-8),mid=left+width/2
        let center=rect.midY,box=CGRect(x:left,y:center-3,width:width,height:6)
        UIColor.tertiarySystemFill.setFill();ctx.fill(box)
        UIColor.systemGreen.withAlphaComponent(0.18).setFill();ctx.fill(CGRect(x:m.above ? mid:left,y:center-3,width:width/2,height:6))
        ctx.setStrokeColor(UIColor.secondaryLabel.cgColor);ctx.setLineDash(phase:0,lengths:[2,2]);ctx.move(to:CGPoint(x:mid,y:center-6));ctx.addLine(to:CGPoint(x:mid,y:center+6));ctx.strokePath();ctx.setLineDash(phase:0,lengths:[])
        let x=left+width*CGFloat(min(1,max(0,(m.value-m.limit+span)/(2*span))))
        UIColor.label.setFill();ctx.fill(CGRect(x:x-2,y:center-6,width:4,height:12))
    }
    private func waterfall(_ ctx:CGContext,_ box:CGRect){
        var sum:Double=0,segments:[(GraphBar,Double,Double)]=[]
        for bar in graph.bars{let start=bar.total ? 0:sum,end=bar.total ? bar.value:sum+bar.value;segments.append((bar,start,end));sum=end}
        let values=segments.flatMap{[$0.1,$0.2]},lo=min(0,values.min() ?? 0),hi=max(1,values.max() ?? 1),pad=max(1,(hi-lo)*0.15)
        let y:(Double)->CGFloat={box.maxY-box.height*CGFloat(($0-lo+pad)/(hi-lo+pad*2))}
        ctx.setStrokeColor(UIColor.separator.cgColor);ctx.move(to:CGPoint(x:box.minX,y:y(0)));ctx.addLine(to:CGPoint(x:box.maxX,y:y(0)));ctx.strokePath()
        let step=box.width/CGFloat(max(1,segments.count))
        for(i,s)in segments.enumerated(){let xx=box.minX+CGFloat(i)*step+step*0.12,width=step*0.76,top=min(y(s.1),y(s.2)),height=max(1,abs(y(s.1)-y(s.2)))
            let color:UIColor=s.0.total ? .systemTeal:s.0.value<0 ? .systemRed:.systemGreen;color.withAlphaComponent(0.75).setFill();ctx.fill(CGRect(x:xx,y:top,width:width,height:height))
            text(s.0.name,x:xx,y:box.maxY+8);text(s.0.value.formatted(.number.precision(.fractionLength(0))),x:xx,y:max(box.minY-10,top-14),color:.label)
        }
    }
}
