import Foundation

enum Screen: String, Codable, Sendable, Hashable { case rankings, agents, agent, run, trade, accounts, account, more, status, scenarios, graveyard, archive, journal, research, document, source, connection, external }

/** Where a screen is: saved in navigation stacks, sent by the server on rows, and the key of its stored copy. */
struct Route: Codable, Sendable, Hashable {
    var screen: Screen
    var id = ""
    var stage = "capital"
    var version = ""
    var title = ""
    var scenario: String? = nil
    init(screen:Screen,id:String="",stage:String="capital",version:String="",title:String="",scenario:String?=nil){self.screen=screen;self.id=id;self.stage=stage;self.version=version;self.title=title;self.scenario=scenario}
    enum CodingKeys:String,CodingKey{case screen,id,stage,version,title,scenario}
    init(from d:Decoder) throws {
        let c=try d.container(keyedBy:CodingKeys.self)
        screen=try c.decode(Screen.self,forKey:.screen);id=c.field(.id,"");stage=c.field(.stage,"capital");version=c.field(.version,"");title=c.field(.title,"");scenario=c.field(.scenario,nil as String?)
    }
    private static func q(_ s:String)->String {s.addingPercentEncoding(withAllowedCharacters:.urlQueryAllowed.subtracting(CharacterSet(charactersIn:"&+?#=/:%"))) ?? s}
    /** The server path of this screen (`/api/native/v2/<key>`), also its row in the phone's store. Empty: built on the phone. */
    var cacheKey: String {
        switch screen {
        case .rankings: return "rankings?stage=\(stage)"+(scenario.map{"&scenario=\(Route.q($0))"} ?? "")
        case .agents,.accounts,.status,.scenarios,.graveyard,.journal,.research: return screen.rawValue
        case .agent,.account,.archive,.document: return "\(screen.rawValue)?id=\(Route.q(id))"
        case .source: return "source?id=\(Route.q(id))&version=\(Route.q(version))"
        // One record shows paper and Capital demo together, so every stage shares one stored copy.
        case .run: return "run?id=\(Route.q(id))"
        case .trade: return "trade?id=\(Route.q(id))&trade=\(Route.q(version))&stage=\(stage)"
        case .more,.connection,.external: return ""
        }
    }
}
struct ScreenState: Codable, Sendable {
    var query = ""
    var sort = 0
    var anchorKey: String? = nil
    var anchorFraction = 0.0
    var atTop = true
    var notice:String? = nil
}

enum Presentation {
    /** The user's cohort alias includes both instruments and the frozen original. */
    static func matches(_ row:Row,query:String)->Bool {
        let q=query.trimmingCharacters(in:.whitespacesAndNewlines)
        if q.lowercased()=="visar",let route=row.route,[Screen.run,.agent].contains(route.screen) {
            return route.id.hasPrefix("visar-night-") || route.id.contains(":visar-night-")
        }
        return q.isEmpty || "\(row.title) \(row.subtitle) \(row.body) \(row.badge)".localizedCaseInsensitiveContains(q)
    }
    /** What the screen shows for a search and sort: rankings sort by the chosen key; every list filters by the query. */
    static func view(_ content:Content,route:Route,query:String,sort:Int)->Content {
        var out=content
        if route.screen == .rankings,!out.sections.isEmpty,sort>0 || !out.sort.isEmpty {
            let k=min(max(sort,0),max(0,out.sort.count-1))
            out.sections[0].rows.sort{a,b in
                let x=a.keys.indices.contains(k) ? a.keys[k]:nil,y=b.keys.indices.contains(k) ? b.keys[k]:nil
                switch (x,y) {case let (x?,y?):return x>y;case (_?,nil):return true;default:return false}
            }
        }
        guard !query.trimmingCharacters(in:.whitespaces).isEmpty else{return out}
        out.sections=out.sections.map{Section(title:$0.title,rows:$0.rows.filter{matches($0,query:query)})}.filter{!$0.rows.isEmpty}
        if !out.sections.isEmpty {
            if route.screen == .agents {
                for i in out.sections.indices where out.sections[i].title.hasSuffix("active variants") {
                    out.sections[i].title="\(out.sections[i].rows.count) active variants"
                }
            }
            else if route.screen == .rankings,let dot=out.sections[0].title.range(of:" · ",options:.backwards) {out.sections[0].title=String(out.sections[0].title[..<dot.lowerBound])+" · \(out.sections[0].rows.count) records"}
        }
        return out
    }
    /** Screens the phone builds itself: the Explore menu and pairing work without the server. */
    static func local(_ route:Route)->Content? {
        switch route.screen {
        case .more:
            return Content(title:"Explore",sections:[Section(title:"",rows:[
                Row(id:"sharpe-trust",title:"Sharpe & Trust",subtitle:"Why high Sharpe lies and how Trader confirms an edge",route:Route(screen:.document,id:"strategy-sharpe-guide",title:"Sharpe & Trust")),
                Row(id:"status",title:"Status",route:Route(screen:.status)),
                Row(id:"scenarios",title:"Execution comparisons",route:Route(screen:.scenarios)),
                Row(id:"graveyard",title:"Graveyard",route:Route(screen:.graveyard)),
                Row(id:"journal",title:"Journal",route:Route(screen:.journal)),
                Row(id:"research",title:"Research",route:Route(screen:.research)),
                Row(id:"connection",title:"Connection",route:Route(screen:.connection))])])
        case .connection:
            return Content(title:"Connection",sections:[Section(title:"Device",rows:[Row(id:"pair",title:"Pair or update connection",action:"pair"),Row(id:"refresh",title:"Refresh saved data",action:"refresh")])])
        case .external: return Content(title:"Source",sections:[])
        default: return nil
        }
    }
}
