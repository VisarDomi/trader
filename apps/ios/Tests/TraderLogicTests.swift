import Foundation
import Testing
@testable import TraderLogic

func json(_ text:String) throws -> JSON {try JSONDecoder().decode(JSON.self,from:Data(text.utf8))}
@Test func rankingsKeepActualDemoEvidenceSeparate() throws {
    let data=try json("""
    [{"runId":"demo:fixture","name":"Fixture","epic":"US500","leverage":200,"metrics":{"totalReturn":0.12,"trades":3,"sharpe":1.2},"demoAdmission":{"reason":"user requested"}}]
    """)
    let c=Presentation.make(Route(screen:.rankings),data:data)
    #expect(c.sections[0].rows[0].badge=="User experiment")
    #expect(c.sections[0].rows[0].route?.stage=="capital")
    #expect(c.sections[0].rows[0].stats[0].value.contains("12"))
}
@Test func capitalRunNeverLabelsVirtualEquityAsActualCash() throws {
    let data=try json("""
    {"id":"demo:fixture","kind":"demo","epic":"US500","capital":10000,"equity":9999,"metrics":{"totalReturn":-0.1},"capitalDemo":{"metrics":{"totalReturn":0.25}},"equityCurve":[{"t":1,"equity":10000},{"t":2,"equity":9999}]}
    """)
    let c=Presentation.make(Route(screen:.run,id:"demo:fixture"),data:data)
    #expect(c.sections[0].title.contains("Capital demo"))
    #expect(c.sections[0].rows[0].stats[0].value.contains("25"))
    #expect(!c.sections.contains{$0.rows.contains{$0.id=="chart"}})
}
@Test func archiveSelectsExactSourceAndPreservesUnknownMetrics() throws {
    let data=try json("""
    {"name":"Fixture","versions":[{"code_hash":"new","source":"new source"},{"code_hash":"old","source":"old source"}]}
    """)
    let c=Presentation.make(Route(screen:.source,id:"fixture",version:"old"),data:data)
    #expect(c.sections[0].rows[0].body=="old source")
    #expect(Presentation.percent(nil)=="—")
}
@Test func routeIdentitiesCannotBecomeQueryParameters() {
    let r=Route(screen:.run,id:"demo:agent/x&stage=backtest#bad")
    let c=URLComponents(string:"https://trader.invalid/api/native/v1/"+r.cacheKey)!
    #expect(c.queryItems?.filter{$0.name=="stage"}.count==1)
    #expect(c.queryItems?.first{$0.name=="id"}?.value==r.id)
}
@Test func evidenceDistinguishesMatchedWindowAndUnknownCosts() throws {
    let e=try json("""
    {"basis":"virtual-equity","admission":"calibration","benchmark":{"status":"matched","from":1000,"through":2000,"strategyReturn":0.02,"benchmarkReturn":0.01,"excessReturn":0.01,"note":"Sizing differs"},"exposure":0.9,"costs":{"closedTrades":3,"reportedTrades":3,"historyComplete":true,"measuredTrades":0,"capturedTrades":0,"reconstructedTrades":0,"closedNetPnl":-10,"beforeFundingPnl":-8,"closedFunding":-2},"dependency":{"state":"user-paused","note":"Model held"}}
    """)
    let sections=Presentation.evidenceSections(e)
    #expect(sections.contains{$0.title=="Forecast dependency"})
    let rows=sections.flatMap(\.rows)
    #expect(rows.contains{$0.stats.contains{$0.label=="Excess" && $0.value.contains("pp")}})
    #expect(rows.contains{$0.body.contains("unknown, not zero")})
}
@Test func rankingShowsClosedTradesAndUsesDependencyState() throws {
    let data=try json("""
    [{"runId":"demo:fixture","name":"Fixture","epic":"US500","leverage":20,"metrics":{"totalReturn":0.02,"trades":0},"dependency":{"state":"user-paused","note":"Model held"},"evidence":{"exposure":0.5,"benchmark":{"status":"matched","excessReturn":-0.01,"from":1000,"through":2000}}}]
    """)
    let c=Presentation.make(Route(screen:.rankings,stage:"virtual"),data:data)
    let row=c.sections[0].rows[0]
    #expect(row.badge=="Forecast paused")
    #expect(row.stats[1].label=="Closed trades")
    #expect(row.stats[2].value.contains("pp"))
    #expect(row.body.contains("Exposure") && row.body.contains("×"))
}

@Test func tradeRoutesEscapeTheIndexAndRetainStage() {
    let route=Route(screen:.trade,id:"demo:fixture:US500:x200:hash",stage:"virtual",version:"1&stage=capital")
    let u=URLComponents(string:"https://trader.invalid/api/native/v1/"+route.cacheKey)!
    #expect(u.queryItems?.filter{$0.name=="stage"}.count==1)
    #expect(u.queryItems?.first{$0.name=="trade"}?.value==route.version)
}
@Test func virtualRunMapsEquityFieldsWithoutLosingTheCurve() throws {
    let data=try json("""
    {"kind":"demo","capital":10000,"equity":10020,"equityCurve":[{"t":1000,"equity":10000},{"t":2000,"equity":10020}],"metrics":{"trades":0}}
    """)
    let c=Presentation.make(Route(screen:.run,id:"demo:fixture",stage:"virtual"),data:data)
    let row=c.sections.flatMap(\.rows).first{$0.id=="chart"}
    #expect(row?.points.map(\.value)==[10000,10020])
    #expect(c.sections.flatMap(\.rows).first{$0.id=="equity-dd"}?.chart?.series.first?.points.count==2)
}
@Test func inspectionChartsRetainMarkersReasonsAndUnknownCosts() throws {
    let data=try json("""
    {"subject":{"runId":"demo:fixture","key":"7","stage":"virtual","epic":"US500","side":"short","size":10,"entryTime":1000,"exitTime":4000,"entryPrice":100,"exitPrice":95,"entryReason":"bearish day, bounce","exitReason":"scheduled exit","timeline":[]},"window":{"from":1000,"through":4000},"price":{"bid":[{"t":1000,"value":100},{"t":4000,"value":94}],"ask":[{"t":1000,"value":101},{"t":4000,"value":95}],"candles":[]},"coverage":{"complete":false,"ticks":2,"candles":0,"gaps":[{"from":2000,"through":3000}]},"risk":{"maxDrawdown":30,"drawdownFraction":0.03,"mae":-30,"mfe":60,"fullTrade":false},"costs":{"net":48,"funding":-2,"spread":null,"timing":null,"midpoint":null},"pnl":[{"t":1000,"value":-10},{"t":4000,"value":50}],"drawdown":[{"t":1000,"value":-10},{"t":4000,"value":-30}],"spread":[{"t":1000,"value":1},{"t":4000,"value":1}],"checks":[]}
    """)
    let sections=Presentation.inspectionSections(data),rows=sections.flatMap(\.rows)
    #expect(rows.first?.chart?.markers.map(\.label)==["OPEN","CLOSE"])
    #expect(rows.first?.chart?.gaps.count==1)
    #expect(rows.contains{$0.body=="bearish day, bounce"})
    #expect(rows.contains{$0.body=="scheduled exit"})
    #expect(rows.first?.stats[1].value.contains("≥")==true)
    #expect(rows.first?.stats[2].value=="—")
    let card=Presentation.tradeCard(data,runId:"demo:fixture",stage:"virtual")
    #expect(card.route?.screen == .trade && card.route?.version=="7")
    #expect(card.chart?.series.count==2)
    #expect(try JSONDecoder().decode(Row.self,from:JSONEncoder().encode(card))==card)
}
@Test func unpricedBrokerCloseRetainsItsTimeWithoutInventingAFillPrice() throws {
    let data=try json("""
    {"subject":{"stage":"capital","entryTime":1000,"entryPrice":100,"exitTime":4000,"exitPrice":null},"price":{},"window":{"from":1000,"through":4000}}
    """)
    let markers=Presentation.tradeGraph(data).markers
    #expect(markers.count==2)
    #expect(markers[1].label=="CLOSE" && markers[1].t==4000 && markers[1].value==nil)
}
@Test func strategyContextShowsThresholdMarginsAndSourceBasis() throws {
    let data=try json("""
    {"basis":"reconstructed","title":"Directional NY day","note":"Original inputs not saved","panels":[{"title":"Previous session","unit":"Price","note":"09:30–16:00 New York","series":[{"name":"Price","points":[{"t":1000,"value":100},{"t":2000,"value":101}]}],"guides":[{"label":"Minimum bullish close","value":100.25}],"markers":[]}],"gates":[{"label":"Directional move","value":0.3,"op":">=","limit":0.25,"unit":"%","margin":0.05,"state":"pass"},{"label":"Forecast","value":null,"op":">","limit":0,"unit":"","margin":null,"state":"unknown"}],"exitRule":"08:27 close","protections":{}}
    """)
    let rows=Presentation.strategySections(data).flatMap(\.rows)
    #expect(rows.first?.badge=="Recomputed")
    #expect(rows.first{$0.id=="strategy-panel-0"}?.chart?.guides?.first?.value==100.25)
    #expect(rows.first{$0.id=="strategy-gate-0"}?.subtitle.contains("pp")==true)
    #expect(rows.first{$0.id=="strategy-gate-1"}?.subtitle.contains("—")==true)
    #expect(rows.first{$0.id=="strategy-gate-0"}?.chart?.meter?.limit==0.25)
}
