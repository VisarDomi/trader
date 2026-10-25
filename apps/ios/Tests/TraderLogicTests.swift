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
@Test func capitalRunUsesBrokerMetricsAndLabelsVirtualCurve() throws {
    let data=try json("""
    {"id":"demo:fixture","kind":"demo","epic":"US500","capital":10000,"equity":9999,"metrics":{"totalReturn":-0.1},"capitalDemo":{"metrics":{"totalReturn":0.25}},"equityCurve":[{"t":1,"equity":10000},{"t":2,"equity":9999}]}
    """)
    let c=Presentation.make(Route(screen:.run,id:"demo:fixture"),data:data)
    #expect(c.sections[0].title.contains("actual broker"))
    #expect(c.sections[0].rows[0].stats[0].value.contains("25"))
    #expect(c.sections.contains{$0.title.contains("Virtual strategy equity")})
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
