import Foundation
import Testing
@testable import TraderLogic

private func screen(_ text:String) throws -> Content {try JSONDecoder().decode(Content.self,from:Data(text.utf8))}
private func packed64(_ xs:[Double])->String {xs.withUnsafeBytes{Data($0)}.base64EncodedString()}
private func packed32(_ xs:[Float])->String {xs.withUnsafeBytes{Data($0)}.base64EncodedString()}

@Test func packedSeriesDecodeExactly() throws {
    let t:[Double]=[1794882420703,1794882421391,1794883105528],v:[Float]=[27272.5,27349.1,.nan]
    let c=try screen("""
    {"v":2,"title":"T","sections":[{"title":"","rows":[{"id":"c","title":"Trade","chart":{"kind":"price","series":[{"name":"Bid","t":"\(packed64(t))","v":"\(packed32(v))"}],
     "guides":[{"label":"Stop","value":27350,"tone":-1}],"markers":[{"t":1794882420703,"value":null,"label":"DEMO CLOSE"}]}}]}]}
    """)
    let g=try #require(c.sections[0].rows[0].chart)
    #expect(g.series[0].t==t)
    #expect(g.series[0].v[0]==27272.5 && abs(g.series[0].v[1]-27349.1)<0.01 && g.series[0].v[2].isNaN)
    #expect(g.guides[0].tone == -1 && g.markers[0].value==nil && g.height==220 && g.precision==2)
}
@Test func theLiveTradeScreenDecodesWithItsThreePriceCharts() throws {
    let url=URL(fileURLWithPath:#filePath).deletingLastPathComponent().appendingPathComponent("Fixtures/trade.json")
    let c=try JSONDecoder().decode(Content.self,from:Data(contentsOf:url))
    let charts=c.sections.flatMap(\.rows).compactMap(\.chart).filter{$0.kind=="line" || $0.kind=="price"}
    // The previous NY session, 22:00 → 03:27, then the trade with its stop and equity-loss lines.
    #expect(charts.count>=3)
    let trade=try #require(c.sections.flatMap(\.rows).first{$0.id=="trade-chart"}?.chart)
    #expect(trade.kind=="price" && trade.series.count==2 && trade.series[0].t.count==trade.series[0].v.count && !trade.series[0].v.isEmpty)
    #expect(trade.guides.contains{$0.label.hasPrefix("Stop")})
    #expect(trade.markers.contains{$0.label=="DEMO OPEN"})
}
@Test func unknownVersionsAreRejectedNotHalfShown() {
    #expect(throws:(any Error).self){try screen(#"{"v":1,"title":"Old","sections":[]}"#)}
}
@Test func rankingsSortByTheChosenKeyWithMissingValuesLast() throws {
    let c=try screen("""
    {"v":2,"title":"Rankings","sort":["Return","Sharpe","Closed trades"],"sections":[{"title":"Capital demo · 3 records","rows":[
     {"id":"a","title":"A","keys":[0.1,null,5]},{"id":"b","title":"B","keys":[0.3,1.0,2]},{"id":"c","title":"C","keys":[null,2.0,9]}]}]}
    """)
    let route=Route(screen:.rankings)
    #expect(Presentation.view(c,route:route,query:"",sort:0).sections[0].rows.map(\.id)==["b","a","c"])
    #expect(Presentation.view(c,route:route,query:"",sort:1).sections[0].rows.map(\.id)==["c","b","a"])
    #expect(Presentation.view(c,route:route,query:"",sort:2).sections[0].rows.map(\.id)==["c","a","b"])
    let found=Presentation.view(c,route:route,query:"b",sort:0)
    #expect(found.sections[0].rows.map(\.id)==["b"] && found.sections[0].title=="Capital demo · 1 records")
}
@Test func visarSearchKeepsTheNightCohort() throws {
    let rows=["demo:visar-night-trading:US500:x200:h","demo:visar-night-v4-us100/no-pullback:US100:x20:h","demo:ema-cross/fast:US500:x20:h"].map{
        #"{"id":"\#($0)","title":"\#($0)","route":{"screen":"run","id":"\#($0)"}}"#}.joined(separator:",")
    let c=try screen(#"{"v":2,"title":"Rankings","sort":["Return"],"sections":[{"title":"Virtual engine · 3 records","rows":[\#(rows)]}]}"#)
    #expect(Presentation.view(c,route:Route(screen:.rankings),query:" VISAR ",sort:0).sections[0].rows.count==2)
}
@Test func routesMapToServerPathsAndRunsShareOneCopy() {
    let id="demo:visar-night-v3-us100/full-day-200:US100:x200:6d175db7dd11"
    #expect(Route(screen:.run,id:id,stage:"capital").cacheKey==Route(screen:.run,id:id,stage:"virtual").cacheKey)
    #expect(Route(screen:.run,id:id).cacheKey=="run?id=demo%3Avisar-night-v3-us100%2Ffull-day-200%3AUS100%3Ax200%3A6d175db7dd11")
    #expect(Route(screen:.trade,id:"demo:x",stage:"capital",version:"6706").cacheKey=="trade?id=demo%3Ax&trade=6706&stage=capital")
    #expect(Route(screen:.rankings,stage:"virtual",scenario:"delay=500").cacheKey=="rankings?stage=virtual&scenario=delay%3D500")
    #expect(Route(screen:.more).cacheKey.isEmpty && Presentation.local(Route(screen:.more)) != nil)
}
@Test func savedNavigationRoutesStillDecode() throws {
    // Routes written by the previous app version (every key present) and routes sent by the server (only some).
    let old=try JSONDecoder().decode(Route.self,from:Data(#"{"screen":"run","id":"demo:a","stage":"capital","version":"","title":""}"#.utf8))
    let sent=try JSONDecoder().decode(Route.self,from:Data(#"{"screen":"trade","id":"demo:a","version":"3"}"#.utf8))
    #expect(old.screen == .run && old.stage=="capital" && sent.stage=="capital" && sent.version=="3")
    #expect(try JSONDecoder().decode(Route.self,from:JSONEncoder().encode(sent))==sent)
}
