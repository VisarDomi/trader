import Foundation

struct GraphSeries:Codable,Sendable,Hashable {var name:String;var points:[Plot]}
struct GraphMarker:Codable,Sendable,Hashable {var t:Double;var value:Double?;var label:String;var detail:String = ""}
struct GraphCandle:Codable,Sendable,Hashable {var t:Double;var open:Double;var high:Double;var low:Double;var close:Double}
struct GraphGap:Codable,Sendable,Hashable {var from:Double;var through:Double}
struct GraphBar:Codable,Sendable,Hashable {var name:String;var value:Double;var total:Bool = false}
struct GraphGuide:Codable,Sendable,Hashable {var label:String;var value:Double}
struct GraphMeter:Codable,Sendable,Hashable {var value:Double;var limit:Double;var above:Bool;var price:Bool? = nil}
struct Graph:Codable,Sendable,Hashable {
    var kind="line"
    var series:[GraphSeries]=[]
    var markers:[GraphMarker]=[]
    var candles:[GraphCandle]=[]
    var gaps:[GraphGap]=[]
    var bars:[GraphBar]=[]
    var unit="USD"
    var precision=2
    var height:Double=220
    var from:Double? = nil
    var through:Double? = nil
    var guides:[GraphGuide]? = nil
    var meter:GraphMeter? = nil
}

extension Presentation {
    static func inspectionDate(_ n:Double?)->String {
        guard let n else{return "—"}
        return Date(timeIntervalSince1970:n/1000).formatted(.dateTime.day().month(.abbreviated).hour().minute().second())
    }
    static func plots(_ j:JSON)->[Plot]{j.items.compactMap{p in guard let t=p["t"].value,let value=p["value"].value,t.isFinite,value.isFinite else{return nil};return Plot(t:t,value:value)}}
    static func tradeGraph(_ j:JSON,height:Double=220)->Graph {
        let s=j["subject"]
        var g=Graph(kind:"price",series:[GraphSeries(name:"Bid",points:plots(j["price"]["bid"])),GraphSeries(name:"Ask",points:plots(j["price"]["ask"]))],unit:"Price",height:height)
        g.candles=j["price"]["candles"].items.compactMap{c in guard let t=c["t"].value,let o=c["open"].value,let h=c["high"].value,let l=c["low"].value,let close=c["close"].value else{return nil};return GraphCandle(t:t,open:o,high:h,low:l,close:close)}
        g.gaps=j["coverage"]["gaps"].items.compactMap{c in guard let f=c["from"].value,let t=c["through"].value else{return nil};return GraphGap(from:f,through:t)}
        if let t=s["entryTime"].value,let p=s["entryPrice"].value {g.markers.append(GraphMarker(t:t,value:p,label:"OPEN",detail:s["entryReason"].text))}
        if let t=s["exitTime"].value {g.markers.append(GraphMarker(t:t,value:s["exitPrice"].value,label:"CLOSE",detail:s["exitPrice"].isNull ? "Fill price not recorded":s["exitReason"].text))}
        g.from=j["window"]["from"].value;g.through=j["window"]["through"].value
        g.precision=["EURUSD","GBPUSD","AUDUSD"].contains(s["epic"].text) ? 5:2
        return g
    }
    static func riskValue(_ j:JSON)->String {
        let risk=j["risk"]
        if risk["fullTrade"].flag,let fraction=risk["drawdownFraction"].value {return percent(-fraction)}
        guard let amount=risk["maxDrawdown"].value else{return "Unknown"}
        return (risk["fullTrade"].flag ? "":"≥")+money(amount)
    }
    static func tradeCard(_ j:JSON,runId:String,stage:String)->Row {
        let s=j["subject"],c=j["costs"],coverage=j["coverage"]
        let entry=s["entryReason"].text.isEmpty ? "Entry reason not recorded":s["entryReason"].text
        let exit=s["exitTime"].isNull ? "Still open":s["exitReason"].text.isEmpty ? "Exit reason not recorded":s["exitReason"].text
        return Row(id:"inspection-"+s["key"].text,title:s["side"].text.capitalized+" · "+money(c["net"].value),
            subtitle:inspectionDate(s["entryTime"].value)+" → "+inspectionDate(s["exitTime"].value),
            body:"Open: "+entry+"\nClose: "+exit,badge:coverage["complete"].flag ? "":"Tick gaps",
            stats:[Stat(label:"Price drawdown",value:riskValue(j),tone:-1),Stat(label:"Spread cost",value:money(c["spread"].value)),Stat(label:"Funding",value:money(c["funding"].value))],
            route:Route(screen:.trade,id:runId,stage:stage,version:s["key"].text),chart:tradeGraph(j,height:200),badgeTone:coverage["complete"].flag ? 1:0)
    }
    static func inspectionSections(_ j:JSON)->[Section] {
        let s=j["subject"],c=j["costs"],risk=j["risk"],coverage=j["coverage"]
        let complete=coverage["complete"].flag
        let stage=s["stage"].text=="capital" ? "Capital demo":s["stage"].text=="backtest" ? "Backtest":"Virtual"
        var sections=[Section(title:stage,rows:[Row(id:"price",title:s["side"].text.capitalized+" · "+number(s["size"].value,digits:3)+" units",
            subtitle:inspectionDate(s["entryTime"].value)+" → "+inspectionDate(s["exitTime"].value),badge:complete ? "":"Tick gaps",
            stats:[Stat(label:"Net P&L",value:money(c["net"].value),tone:tone(c["net"].value)),Stat(label:"Price drawdown",value:riskValue(j),tone:-1),Stat(label:"Spread cost",value:money(c["spread"].value))],chart:tradeGraph(j,height:280),badgeTone:complete ? 1:0)])]
        let notional=(s["size"].value ?? 0)*(s["entryPrice"].value ?? 0)
        let equity=s["entryEquity"].value
        sections.append(Section(title:"Sizing",rows:[Row(id:"sizing",title:tier(s["leverage"]),
            stats:[Stat(label:"Notional",value:money(notional)),Stat(label:"Entry equity",value:money(equity)),Stat(label:"Exposure",value:equity.map{number(notional/$0)+"×"} ?? "—")])]))
        var decisions:[Row]=[]
        for (label,key,time,price) in [("Open","entryReason","entryTime","entryPrice"),("Close","exitReason","exitTime","exitPrice")] {
            let reason=s[key].text.isEmpty ? (s[time].isNull ? "Still open":"Reason not recorded"):s[key].text
            decisions.append(Row(id:key,title:label+" · "+number(s[price].value,digits:["EURUSD","GBPUSD","AUDUSD"].contains(s["epic"].text) ? 5:2),subtitle:inspectionDate(s[time].value),body:reason))
        }
        sections.append(Section(title:"",rows:decisions))
        if !j["strategy"].isNull {sections += strategySections(j["strategy"])}
        let gaps=tradeGraph(j).gaps,from=j["window"]["from"].value,through=j["window"]["through"].value
        if !j["pnl"].items.isEmpty {
            sections.append(Section(title:"",rows:[
                Row(id:"trade-pnl",title:"Price P&L",stats:[Stat(label:complete ? "Worst adverse":"Observed adverse",value:money(risk["mae"].value),tone:-1),Stat(label:complete ? "Best favorable":"Observed favorable",value:money(risk["mfe"].value),tone:1),Stat(label:"Max decline",value:money(risk["maxDrawdown"].value),tone:-1)],chart:Graph(series:[GraphSeries(name:"P&L",points:plots(j["pnl"]))],gaps:gaps,from:from,through:through)),
                Row(id:"trade-dd",title:complete ? "Drawdown":"Drawdown · partial",chart:Graph(series:[GraphSeries(name:"Drawdown",points:plots(j["drawdown"]))],gaps:gaps,from:from,through:through)),
                Row(id:"trade-spread",title:"Spread",chart:Graph(series:[GraphSeries(name:"Spread",points:plots(j["spread"]))],gaps:gaps,unit:"Points",precision:5,from:from,through:through))]))
        }
        var costRows=[Row(id:"cost-values",title:"",stats:[Stat(label:"Funding",value:money(c["funding"].value)),Stat(label:"Timing cost",value:money(c["timing"].value))])]
        if abs(c["adjustment"].value ?? 0)>0.011 {costRows[0].stats.append(Stat(label:"Adjustment",value:money(c["adjustment"].value)))}
        if let midpoint=c["midpoint"].value,let spread=c["spread"].value,let net=c["net"].value {
            var bars:[GraphBar]=[]
            if let timing=c["timing"].value {bars=[GraphBar(name:"Signal",value:midpoint+timing,total:true),GraphBar(name:"Timing",value:-timing)]}
            else{bars=[GraphBar(name:"Midpoint",value:midpoint,total:true)]}
            bars += [GraphBar(name:"Spread",value:-spread),GraphBar(name:"Funding",value:c["funding"].value ?? 0),GraphBar(name:"Adjust",value:c["adjustment"].value ?? 0),GraphBar(name:"Net",value:net,total:true)]
            costRows.append(Row(id:"cost-waterfall",title:"Signal → net",chart:Graph(kind:"waterfall",bars:bars)))
        }
        sections.append(Section(title:"",rows:costRows))
        var coverageRows:[Row]=[]
        if !complete {coverageRows.append(Row(id:"coverage",title:"\(number(coverage["ticks"].value,digits:0)) quotes · \(number(coverage["candles"].value,digits:0)) candles",badge:j["window"]["clipped"].flag ? "Last 7 days":coverage["limited"].flag ? "Partial":"",badgeTone:0))}
        for gap in coverage["gaps"].items {coverageRows.append(Row(id:"gap-"+String(gap["from"].value ?? 0),title:"Gap",subtitle:inspectionDate(gap["from"].value)+" → "+inspectionDate(gap["through"].value)))}
        if !coverageRows.isEmpty {sections.append(Section(title:"",rows:coverageRows))}
        if s["timeline"].items.count>2 {sections.append(Section(title:"Orders",rows:s["timeline"].items.enumerated().map{i,t in Row(id:"timing-\(i)",title:t["label"].text,subtitle:inspectionDate(t["t"].value))}))}
        return sections
    }
}
