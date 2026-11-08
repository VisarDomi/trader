import Foundation

extension Presentation {
    static func gateNumber(_ n:Double?,unit:String)->String {
        guard let n else{return "Unknown"}
        if unit=="yes/no"{return n==1 ? "Yes":"No"}
        if unit=="direction"{return n>0 ? "Bullish":n<0 ? "Bearish":"Unqualified"}
        if unit=="minute of day"{return String(format:"%02d:%02d",Int(n)/60,Int(n)%60)}
        if unit=="Sunday = 0"{return ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][min(6,max(0,Int(n)))]}
        if unit=="fraction"{return gateNumber(n*100,unit:"%") }
        let digits=abs(n)>0 && abs(n)<0.01 ? 6:unit=="Price" && abs(n)<10 ? 5:unit=="Price" ? 2:3
        return n.formatted(.number.precision(.fractionLength(0...digits)))+(unit.isEmpty || unit=="Price" ? "":" "+unit)
    }
    static func strategySections(_ d:JSON)->[Section] {
        let basis=d["basis"].text
        var sections:[Section]=[],panels:[Row]=[]
        for (i,p) in d["panels"].items.enumerated() {
            let unit=p["unit"].text,guides=p["guides"].items.compactMap{g->GraphGuide? in guard let v=g["value"].value else{return nil};return GraphGuide(label:g["label"].text,value:v)}
            let series=p["series"].items.map{GraphSeries(name:$0["name"].text,points:plots($0["points"]))}
            let markers=p["markers"].items.compactMap{m->GraphMarker? in guard let t=m["t"].value else{return nil};return GraphMarker(t:t,value:m["value"].value,label:m["label"].text)}
            let title=p["title"].text.replacingOccurrences(of:"Previous New York session",with:"Previous NY session").replacingOccurrences(of:" reference → 03:27 decision",with:" → 03:27")
            var row=Row(id:"strategy-panel-\(i)",title:title,badge:i==0 && basis=="reconstructed" ? "Recomputed":"",badgeTone:0)
            if series.contains(where:{!$0.points.isEmpty}){
                let precision=unit=="Price" && guides.contains(where:{abs($0.value)<10}) ? 5:2
                let candles=p["candles"].items.compactMap{c->GraphCandle? in guard let t=c["t"].value,let o=c["open"].value,let h=c["high"].value,let l=c["low"].value,let close=c["close"].value else{return nil};return GraphCandle(t:t,open:o,high:h,low:l,close:close)}
                row.chart=Graph(series:series,markers:markers,candles:candles,unit:unit,precision:precision,height:240,from:p["from"].value,through:p["through"].value,guides:guides)
                row.body=guides.map{$0.label+" "+number($0.value,digits:precision)}.joined(separator:" · ")
            }else{row.body=guides.map{$0.label+": "+gateNumber($0.value,unit:unit)}.joined(separator:"\n")}
            panels.append(row)
        }
        if !panels.isEmpty {sections.append(Section(title:"",rows:panels))}
        else if basis=="unavailable" {sections.append(Section(title:"",rows:[Row(id:"strategy-basis",title:"Setup data —")]))}
        let redundant:Set<String>=["15-minute checkpoints","Session direction","Calendar allows entry","Entry clock","Weekday entry","Reference belongs to previous day"]
        let gates=d["gates"].items.enumerated().compactMap{i,g->Row? in
            let state=g["state"].text,label=g["label"].text
            if state=="pass" && redundant.contains(label){return nil}
            let value=g["value"].value,limit=g["limit"].value,margin=g["margin"].value,unit=label=="Session direction" ? "direction":g["unit"].text,op=g["op"].text
            let delta=margin.map{($0>0 ? "+":"")+gateNumber(unit=="fraction" ? $0*100:$0,unit:unit=="%" || unit=="fraction" ? "pp":unit=="minute of day" ? "minutes":unit)+(unit=="Price" ? " points":"")} ?? "—"
            let actual=value==nil ? "—":gateNumber(value,unit:unit),cutoff=limit==nil ? "—":gateNumber(limit,unit:unit)
            var row=Row(id:"strategy-gate-\(i)",title:label,subtitle:actual+" "+op+" "+cutoff+(op=="=" ? "":" · Δ "+delta),badge:state=="fail" ? "Outside":"",badgeTone:-1)
            if op != "=",let value,let limit {row.chart=Graph(kind:"meter",height:18,meter:GraphMeter(value:value,limit:limit,above:op==">" || op==">=",price:unit=="Price"))}
            return row
        }
        if !gates.isEmpty {sections.append(Section(title:"Entry limits",rows:gates))}
        let p=d["protections"]
        if !p["stopLoss"].isNull || !p["takeProfit"].isNull {sections.append(Section(title:"",rows:[Row(id:"strategy-exit",title:"Initial protection",stats:[Stat(label:"Stop",value:number(p["stopLoss"].value,digits:2)),Stat(label:"Target",value:number(p["takeProfit"].value,digits:2))])]))}
        return sections
    }
}
