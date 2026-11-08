import UIKit

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
        guard let pan=g as? UIPanGestureRecognizer else{return true};let v=pan.velocity(in:self);return abs(v.x)>abs(v.y)
    }
    @objc private func scrub(_ g:UIGestureRecognizer){probe=g.location(in:self).x;setNeedsDisplay()}
    private func text(_ value:String,x:CGFloat,y:CGFloat,color:UIColor = .secondaryLabel){(value as NSString).draw(at:CGPoint(x:x,y:y),withAttributes:[.font:font,.foregroundColor:color])}
    private func formatted(_ value:Double)->String{value.formatted(.number.precision(.fractionLength(graph.precision)))}
    private let colors:[UIColor]=[.systemTeal,.systemOrange,.systemPurple,.systemBlue]
    override func draw(_ rect:CGRect){
        guard let ctx=UIGraphicsGetCurrentContext()else{return}
        let box=CGRect(x:58,y:28,width:max(10,rect.width-66),height:max(10,rect.height-55))
        if graph.kind=="waterfall"{waterfall(ctx,box);return}
        if graph.kind=="bars"{bars(ctx,rect);return}
        let all=graph.series.flatMap(\.points),times=all.map(\.t)+graph.candles.map(\.t)
        let first=graph.from ?? times.min() ?? graph.markers.map(\.t).min() ?? 0,last=graph.through ?? times.max() ?? graph.markers.map(\.t).max() ?? first+60000
        let timeSpan=max(1,last-first)
        let visibleMarkers=graph.markers.filter{$0.t>=first && $0.t<=last}
        let values=all.map(\.value)+graph.candles.flatMap{[$0.low,$0.high]}+visibleMarkers.map(\.value)
        guard let minimum=values.min(),let maximum=values.max()else{text("No price history",x:box.minX,y:box.midY);return}
        let pad=max((maximum-minimum)*0.10,max(abs(maximum)*0.00001,0.000001)),lo=minimum-pad,hi=maximum+pad
        let x:(Double)->CGFloat={box.minX+box.width*CGFloat(($0-first)/timeSpan)}
        let y:(Double)->CGFloat={box.maxY-box.height*CGFloat(($0-lo)/(hi-lo))}
        ctx.setLineWidth(0.5);ctx.setStrokeColor(UIColor.separator.cgColor)
        for i in 0...3{let yy=box.minY+box.height*CGFloat(i)/3;ctx.move(to:CGPoint(x:box.minX,y:yy));ctx.addLine(to:CGPoint(x:box.maxX,y:yy));text(formatted(hi-(hi-lo)*Double(i)/3),x:0,y:yy-6)};ctx.strokePath()
        if graph.kind=="price",graph.series.count>=2 {
            let bid=graph.series[0].points,ask=graph.series[1].points
            if bid.count>1 && bid.count==ask.count {
                let band=UIBezierPath();for(i,p)in bid.enumerated(){let a=CGPoint(x:x(p.t),y:y(p.value));i==0 ? band.move(to:a):band.addLine(to:a)}
                for p in ask.reversed(){band.addLine(to:CGPoint(x:x(p.t),y:y(p.value)))};band.close();UIColor.systemTeal.withAlphaComponent(0.10).setFill();band.fill()
            }
        }
        for gap in graph.gaps where gap.through>=first && gap.from<=last {
            let left=x(max(first,gap.from)),right=x(min(last,gap.through));UIColor.tertiarySystemFill.setFill();ctx.fill(CGRect(x:left,y:box.minY,width:max(1,right-left),height:box.height))
        }
        for c in graph.candles where c.t>=first && c.t<=last {
            let xx=x(c.t);ctx.setStrokeColor(UIColor.tertiaryLabel.cgColor);ctx.setLineWidth(1)
            ctx.move(to:CGPoint(x:xx,y:y(c.high)));ctx.addLine(to:CGPoint(x:xx,y:y(c.low)));ctx.strokePath()
            let width=max(1,min(5,box.width/CGFloat(max(1,graph.candles.count))*0.5));ctx.setFillColor(UIColor.secondaryLabel.withAlphaComponent(0.4).cgColor);ctx.fill(CGRect(x:xx-width/2,y:min(y(c.open),y(c.close)),width:width,height:max(1,abs(y(c.open)-y(c.close)))))
        }
        for(i,series)in graph.series.enumerated(){
            let path=UIBezierPath();var previous:Plot?
            for p in series.points {
                let point=CGPoint(x:x(p.t),y:y(p.value));let gap=previous.map{before in graph.gaps.contains{$0.from<p.t && $0.through>before.t}} ?? true
                if gap{path.move(to:point)}else{path.addLine(to:point)};previous=p
            };colors[i%colors.count].setStroke();path.lineWidth=1.6;path.stroke()
        }
        for m in visibleMarkers {
            let xx=x(m.t),yy=y(m.value),color:UIColor=m.label=="OPEN" ? .systemBlue:.systemGreen
            ctx.saveGState();ctx.setStrokeColor(color.withAlphaComponent(0.5).cgColor);ctx.setLineDash(phase:0,lengths:[3,3]);ctx.move(to:CGPoint(x:xx,y:box.minY));ctx.addLine(to:CGPoint(x:xx,y:box.maxY));ctx.strokePath();ctx.restoreGState()
            color.setFill();ctx.fillEllipse(in:CGRect(x:xx-4,y:yy-4,width:8,height:8))
            let label=m.label;let width=(label as NSString).size(withAttributes:[.font:font]).width;text(label,x:min(box.maxX-width,max(box.minX,xx-width/2)),y:box.minY-15,color:color)
        }
        for(i,t)in [first,(first+last)/2,last].enumerated(){let label=Date(timeIntervalSince1970:t/1000).formatted(timeSpan>172800000 ? .dateTime.month(.abbreviated).day():.dateTime.hour().minute());let w=(label as NSString).size(withAttributes:[.font:font]).width;let xx=i==0 ? box.minX:i==2 ? box.maxX-w:box.midX-w/2;text(label,x:xx,y:box.maxY+8)}
        if let probe {
            let xx=min(box.maxX,max(box.minX,probe)),at=first+Double((xx-box.minX)/box.width)*timeSpan
            ctx.setStrokeColor(UIColor.label.withAlphaComponent(0.5).cgColor);ctx.move(to:CGPoint(x:xx,y:box.minY));ctx.addLine(to:CGPoint(x:xx,y:box.maxY));ctx.strokePath()
            var labels=[Date(timeIntervalSince1970:at/1000).formatted(.dateTime.hour().minute().second())]
            for s in graph.series where !graph.gaps.contains(where:{$0.from<=at && $0.through>=at}) {if let p=s.points.min(by:{abs($0.t-at)<abs($1.t-at)}){labels.append(s.name+" "+formatted(p.value))}}
            if graph.gaps.contains(where:{$0.from<=at && $0.through>=at}){labels.append("No recorded quotes")}
            text(labels.joined(separator:" · "),x:box.minX,y:0,color:.label)
        }else{text((graph.series.contains(where:{!$0.points.isEmpty}) ? graph.series.filter{!$0.points.isEmpty}.map(\.name).joined(separator:" / "):"Minute candles")+" · "+graph.unit,x:box.minX,y:0)}
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
