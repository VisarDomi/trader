import Foundation

enum JSON: Codable, Sendable, Equatable {
    case null, bool(Bool), number(Double), string(String), array([JSON]), object([String: JSON])
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode([JSON].self) { self = .array(v) }
        else { self = .object(try c.decode([String: JSON].self)) }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .string(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        }
    }
    subscript(_ key: String) -> JSON { if case .object(let v) = self { return v[key] ?? .null }; return .null }
    var items: [JSON] { if case .array(let v) = self { return v }; return [] }
    var text: String { if case .string(let v) = self { return v }; return "" }
    var value: Double? { if case .number(let v) = self { return v }; return nil }
    var flag: Bool { if case .bool(let v) = self { return v }; return false }
    var isNull: Bool { self == .null }
}

enum Screen: String, Codable, Sendable, Hashable { case rankings, agents, agent, run, accounts, account, more, status, scenarios, graveyard, archive, journal, research, document, source, connection, external }
struct Route: Codable, Sendable, Hashable {
    var screen: Screen
    var id = ""
    var stage = "capital"
    var version = ""
    var title = ""
    var scenario:String? = nil
    var cacheKey: String {
        switch screen {
        case .rankings:
            var key="leaderboard?stage=\(stage)"
            if let scenario {
                let escaped=scenario.addingPercentEncoding(withAllowedCharacters:.urlQueryAllowed.subtracting(CharacterSet(charactersIn:"&+?#"))) ?? scenario
                key += "&scenario=\(escaped)"
            }
            return key
        case .agents: return "agents"
        case .agent, .source: return "agent?id=\(id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed.subtracting(CharacterSet(charactersIn: "&+?#"))) ?? id)"
        case .run: return "run?id=\(id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed.subtracting(CharacterSet(charactersIn: "&+?#"))) ?? id)&stage=\(stage)"
        case .accounts, .account: return "broker"
        case .status, .scenarios: return "status"
        case .graveyard, .archive: return "graveyard"
        case .journal: return "journal"
        case .research: return "research"
        case .document: return "research?topic=\(id)"
        default: return ""
        }
    }
}
struct Stat: Codable, Sendable, Hashable { var label: String; var value: String; var tone = 0 }
struct Plot: Codable, Sendable, Hashable { var t: Double; var value: Double }
struct Row: Codable, Sendable, Hashable {
    var id: String
    var title: String
    var subtitle = ""
    var body = ""
    var badge = ""
    var stats: [Stat] = []
    var route: Route? = nil
    var action = ""
    var code = false
    var points: [Plot] = []
}
struct Section: Codable, Sendable, Hashable { var title: String; var rows: [Row] }
struct Content: Codable, Sendable { var title: String; var subtitle = ""; var sections: [Section]; var refreshed: Double = 0;var renderID:Int = 0 }

enum Presentation {
    static func number(_ n: Double?, digits: Int = 2) -> String {
        guard let n, n.isFinite else { return "—" }
        return n.formatted(.number.precision(.fractionLength(digits)))
    }
    static func percent(_ n: Double?) -> String {
        guard let n else { return "—" }; return (n > 0 ? "+" : "") + number(n * 100, digits: 1) + "%"
    }
    static func money(_ n: Double?) -> String { guard let n else { return "—" }; return "$" + number(n) }
    static func date(_ n: Double?) -> String {
        guard let n, n > 0 else { return "Not recorded" }
        return Date(timeIntervalSince1970: n / 1000).formatted(date: .abbreviated, time: .shortened)
    }
    static func tone(_ n: Double?) -> Int { guard let n else { return 0 }; return n > 0 ? 1 : n < 0 ? -1 : 0 }
    static func tier(_ j: JSON) -> String { j.value.map { "1:\(Int($0))" } ?? "Pre-tiers" }
    static func points(_ n:Double?) -> String {guard let n else{return "—"};return (n>0 ? "+":"")+number(n*100)+" pp"}
    static func evidenceSections(_ e:JSON)->[Section] {
        guard !e.isNull else{return []}
        var sections:[Section]=[]
        let b=e["benchmark"],c=e["costs"],dependency=e["dependency"]
        if !dependency.isNull && dependency["state"].text != "available" {
            sections.append(Section(title:"Forecast dependency",rows:[Row(id:"dependency",title:dependency["state"].text=="user-paused" ? "TimesFM paused by resource hold":"TimesFM unavailable",body:dependency["note"].text+" Known downtime is excluded from virtual maturity.")]))
        }
        var rows:[Row]=[]
        if b["status"].text=="matched" {
            rows.append(Row(id:"benchmark",title:"Common-date comparison",subtitle:"\(date(b["from"].value)) → \(date(b["through"].value))",body:b["note"].text,
                stats:[Stat(label:"Strategy",value:percent(b["strategyReturn"].value)),Stat(label:"Buy & hold",value:percent(b["benchmarkReturn"].value)),Stat(label:"Excess",value:points(b["excessReturn"].value),tone:tone(b["excessReturn"].value))]))
        } else {rows.append(Row(id:"benchmark",title:"Benchmark unavailable",body:b["note"].text))}
        rows.append(Row(id:"exposure",title:"Actual sizing · \(e["admission"].text.replacingOccurrences(of:"-",with:" "))",body:"Notional / equity differs from the account leverage ceiling. Stop downside is measured from current equity; gaps and fees can change it.",
            stats:[Stat(label:"Exposure",value:e["exposure"].value.map{number($0)+"×"} ?? "—"),Stat(label:"Stop downside",value:percent(e["stopRisk"].value)),Stat(label:"Open P&L",value:money(e["unrealizedPnl"].value))]))
        sections.append(Section(title:"Benchmark and risk evidence",rows:rows))
        if c.isNull {sections.append(Section(title:"Actual demo cash coverage",rows:[Row(id:"coverage",title:"Realized cash is separate from held equity",body:e["note"].text)]));return sections}
        var costs=[Row(id:"totals",title:"Stored closed-trade accounting",body:"Executable bid/ask price P&L still contains spread and timing effects.",stats:[Stat(label:"Before funding",value:money(c["beforeFundingPnl"].value)),Stat(label:"Funding",value:money(c["closedFunding"].value)),Stat(label:"Net",value:money(c["closedNetPnl"].value))]),
            Row(id:"coverage",title:"\(number(c["measuredTrades"].value,digits:0))/\(number(c["closedTrades"].value,digits:0)) quote-supported trades",body:"\(number(c["capturedTrades"].value,digits:0)) at-fill references · \(number(c["reconstructedTrades"].value,digits:0)) archived quote matches. Missing costs are unknown, not zero.")]
        if !c["historyComplete"].flag {costs.append(Row(id:"partial",title:"Stored history is a subset",body:"\(number(c["closedTrades"].value,digits:0)) stored of \(number(c["reportedTrades"].value,digits:0)) reported trades. Totals cover stored trades."))}
        if (c["measuredTrades"].value ?? 0)>0 {
            costs.append(Row(id:"decomposition",title:"Quote-supported subset",body:"Midpoint P&L minus quoted spread, plus funding and rounding/protection adjustments equals subset net. Reconstructed quote identity is inferred; old decision timing is unknown.",stats:[Stat(label:"Midpoint",value:money(c["midpointPnl"].value)),Stat(label:"Spread",value:money(c["spreadCost"].value)),Stat(label:"Net",value:money(c["measuredNetPnl"].value))]))
            let timingNote=(c["timedTrades"].value ?? 0)>0 ? "Timed-subset signal P&L \(money(c["timedSignalPnl"].value)); net \(money(c["timedNetPnl"].value)).":"Decision-price attribution is unknown for these trades."
            costs.append(Row(id:"stress",title:"Fixed-trade double-spread scenario",body:"Observed sizes/trades are unchanged; signals, stops and liquidations are not re-simulated. Both decision quotes known for \(number(c["timedTrades"].value,digits:0)) trades. "+timingNote,stats:[Stat(label:"Scenario P&L",value:money(c["doubledSpreadPnl"].value)),Stat(label:"Timing cost",value:(c["timedTrades"].value ?? 0)>0 ? money(c["timingCost"].value):"Unknown")]))
        }
        costs.append(Row(id:"qualification",title:"Evidence limits",body:e["note"].text))
        sections.append(Section(title:e["basis"].text=="historical-equity" ? "Historical simulation costs":"Virtual execution costs",rows:costs));return sections
    }
    static func performance(_ m: JSON) -> [Stat] {
        [Stat(label: "Return", value: percent(m["totalReturn"].value), tone: tone(m["totalReturn"].value)),
         Stat(label: "Trades", value: number(m["trades"].value, digits: 0)),
         Stat(label: "Sharpe", value: number(m["sharpe"].value))]
    }
    static func runRow(_ r: JSON, stage: String = "virtual", name: String? = nil) -> Row {
        let id = r["runId"].text.isEmpty ? r["id"].text : r["runId"].text
        var badge = r["status"].text == "retired" ? "Archived" : ""
        if r["status"].text == "retired" {badge = "Archived"}
        else if r["comparisonOnly"].flag {badge = r["control"].flag ? "Control · comparison":"Execution comparison"}
        else if r["control"].flag {badge = "Control"}
        else if !r["demoAdmission"].isNull { badge = "User experiment" }
        else if stage == "capital" { badge = r["mirrored"].flag ? "Capital demo":"Past demo assignment" }
        else if stage == "virtual" && badge.isEmpty { badge = r["forwardVerdict"].text.isEmpty ? "Forward record":r["forwardVerdict"].text.capitalized+" evidence" }
        let period=stage=="backtest" ? (r["windowId"].text.isEmpty ? id.split(separator:":").dropFirst().first.map(String.init) ?? "":r["windowId"].text):r["timeframe"].text
        let e=r["evidence"],b=e["benchmark"]
        var stats=performance(r["metrics"]),body=""
        if stage != "capital",b["status"].text=="matched" {stats[2]=Stat(label:"Excess vs hold",value:points(b["excessReturn"].value),tone:tone(b["excessReturn"].value));body="Matched \(date(b["from"].value)) → \(date(b["through"].value)); sizing differs."}
        if let exposure=e["exposure"].value {body += " Exposure \(number(exposure))× equity."}
        if e["admission"].text=="calibration" && badge.isEmpty {badge="Calibration"}
        if e["admission"].text=="backtest-rejected" && badge.isEmpty {badge="Fails admission gate"}
        let dependency=r["dependency"].isNull ? e["dependency"]:r["dependency"]
        if !dependency.isNull && dependency["state"].text != "available" {if stage=="virtual" && r["status"].text != "retired" {badge="Forecast paused"};body += " "+dependency["note"].text}
        if stage=="capital" {stats[2]=Stat(label:"Cash drawdown",value:percent(r["metrics"]["maxDrawdown"].value));body="Realized cash excludes open P&L and unallocated funding. Cash drawdown excludes intratrade risk."}
        stats[1].label="Closed trades"
        return Row(id: id, title: name ?? (r["name"].text.isEmpty ? r["epic"].text : r["name"].text),
                   subtitle: [r["epic"].text, tier(r["leverage"]), period].filter { !$0.isEmpty }.joined(separator: " · "),
                   body:body,badge: badge, stats:stats, route: Route(screen: .run, id: id, stage: stage))
    }
    static func matches(_ row: Row, query: String) -> Bool {
        query.isEmpty || "\(row.title) \(row.subtitle) \(row.body) \(row.badge)".localizedCaseInsensitiveContains(query)
    }
    static func make(_ route: Route, data: JSON, query: String = "", sort: Int = 0) -> Content {
        var out: Content
        switch route.screen {
        case .rankings:
            let stageName = route.stage == "capital" ? "Capital demo" : route.stage == "virtual" ? "Virtual engine" : "Backtests"
            let items = data.items.sorted { a,b in
                if sort==3{return (a["evidence"]["benchmark"]["excessReturn"].value ?? -Double.greatestFiniteMagnitude)>(b["evidence"]["benchmark"]["excessReturn"].value ?? -Double.greatestFiniteMagnitude)}
                let key = sort == 1 ? "sharpe" : sort == 2 ? "trades" : "totalReturn"
                return (a["metrics"][key].value ?? -Double.greatestFiniteMagnitude) > (b["metrics"][key].value ?? -Double.greatestFiniteMagnitude)
            }
            out = Content(title: "Rankings", subtitle: route.stage == "capital" ? "Actual demo cashflows · active and past assignments" : route.stage == "virtual" ? "Independent virtual capital · live Capital quotes" : "Historical simulation · recorded and synthetic paths are labeled", sections: [
                Section(title: "\(stageName) · \(items.count) records", rows: items.map { runRow($0, stage: route.stage) })])
            if let scenario=route.scenario,scenario != "standard" {out.subtitle="\(scenario) · correlated execution comparisons, not independent strategies"}
        case .agents:
            let items = data.items.filter { $0["active"].flag }.sorted { $0["name"].text.localizedStandardCompare($1["name"].text) == .orderedAscending }
            out = Content(title: "Agents", subtitle: "Strategies, controls and their current source", sections: [Section(title: "\(items.count) active variants", rows: items.map { a in
                Row(id: a["id"].text, title: a["name"].text, subtitle: "\(a["timeframe"].text) · \(a["instruments"].items.map(\.text).joined(separator: ", "))", body: a["description"].text,
                    badge: a["usesForecast"].flag ? "TimesFM" : "", route: Route(screen: .agent, id: a["id"].text))
            })])
        case .agent:
            let runs = data["runs"].items
            out = Content(title: data["name"].text, subtitle: data["description"].text, sections: [
                Section(title: "Strategy", rows: [Row(id: "source", title: "View current source", subtitle: data["codeHash"].text, route: Route(screen: .source,id: route.id,version: data["codeHash"].text)),Row(id:"parameters",title:"Parameters",body:String(data:(try? JSONEncoder().encode(data["params"])) ?? Data(),encoding:.utf8) ?? "",code:true)]),
                Section(title: "Virtual records", rows: runs.filter { $0["kind"].text == "demo" && $0["status"].text != "retired" }.map { runRow($0) }),
                Section(title: "Backtests", rows: runs.filter { $0["kind"].text == "backtest" && $0["status"].text != "retired" }.map { runRow($0,stage:"backtest") }),
                Section(title: "Archived records", rows: runs.filter { $0["status"].text == "retired" }.map { runRow($0) })])
        case .run:
            let metrics = data["metrics"]
            let isBacktest = data["kind"].text == "backtest"
            let label = isBacktest ? "Backtest" : "Virtual strategy"
            var sections: [Section] = []
            if !data["capitalDemo"].isNull && !isBacktest && route.stage == "capital" {
                sections.append(Section(title:"Capital demo · actual broker results",rows:[Row(id:"actual",title:"Realized demo performance",subtitle:data["capitalDemo"]["brokerEvidence"]["basis"].text,stats:performance(data["capitalDemo"]["metrics"]))]))
            }
            var summary = Row(id:"summary",title:"\(label) equity \(money(data["equity"].value))",subtitle:"\(date(data["startedAt"].value)) · code \(data["codeHash"].text)",badge:data["status"].text,stats:performance(metrics))
            if !data["extra"]["retirement"].isNull { summary.body = data["extra"]["retirement"]["reason"].text }
            sections.append(Section(title:label,rows:[summary,Row(id:"risk",title:"Risk and evidence",stats:[Stat(label:"Max drawdown",value:percent(metrics["maxDrawdown"].value)),Stat(label:"Trade t",value:number(metrics["tStat"].value)),Stat(label:"Win rate",value:percent(metrics["winRate"].value))])]))
            if route.stage=="capital" && !data["capitalDemo"]["evidence"].isNull {sections += evidenceSections(data["capitalDemo"]["evidence"])}
            sections += evidenceSections(data["evidence"])
            let comparison=data["backtestComparison"]
            if !isBacktest && !comparison.isNull {sections.append(Section(title:"Backtest of the same strategy code",rows:[runRow(comparison,stage:"backtest",name:"Compare with historical simulation")]))}
            let points = data["equityCurve"].items.compactMap { p -> Plot? in guard let t=p["t"].value, let v=p["equity"].value else {return nil};return Plot(t:t,value:v) }
            if !points.isEmpty { sections.append(Section(title:"\(label) equity · sampled curve",rows:[Row(id:"chart",title:"Equity history",points:points)])) }
            let tape=data["extra"]["data"]
            if !tape.isNull { sections.append(Section(title:"Replay provenance",rows:[Row(id:"data",title:"Recorded \(number(tape["recordedTicks"].value,digits:0)) · synthetic \(number(tape["syntheticTicks"].value,digits:0))",body:tape["execution"].text)])) }
            let p=data["position"]
            if !p.isNull { sections.append(Section(title:"Open virtual position",rows:[Row(id:"position",title:"\(p["side"].text.capitalized) · \(number(p["size"].value,digits:3)) units",subtitle:"Entry \(number(p["entryPrice"].value)) · \(date(p["entryTime"].value))",body:"Stop \(number(p["stopLoss"].value)) · Target \(number(p["takeProfit"].value))")])) }
            sections.append(Section(title:"Closed strategy trades",rows:data["trades"].items.reversed().enumerated().map { i,t in
                Row(id:"trade\(i)",title:"\(t["side"].text.capitalized) · \(money(t["pnl"].value))",subtitle:date(t["exitTime"].value),body:"\(number(t["entryPrice"].value)) → \(number(t["exitPrice"].value)) · \(t["exitReason"].text)",stats:[Stat(label:"Funding",value:money(t["funding"].value)),Stat(label:"Size",value:number(t["size"].value,digits:3))])
            }))
            if !data["deals"].items.isEmpty { sections.append(Section(title:"Actual Capital demo deals",rows:data["deals"].items.prefix(100).enumerated().map { i,d in Row(id:"deal\(i)",title:"\(d["account"].text) · \(d["status"].text)",subtitle:date(d["close_time"].value ?? d["open_time"].value),body:"\(d["side"].text) · \(number(d["size"].value,digits:3)) · P&L \(money(d["pnl"].value))") })) }
            if !isBacktest && data["status"].text != "retired" && !route.id.contains(":delay=") {sections.append(Section(title:"Demo mirror control",rows:[Row(id:"exclude",title:data["brokerExcluded"].flag ? "Allow this strategy on Capital demo":"Exclude this strategy from Capital demo",body:"The virtual strategy and its history continue independently.",action:"exclude:\(data["brokerExcluded"].flag ? "false":"true"):\(route.id)")]))}
            out = Content(title:"\(data["epic"].text) · \(tier(data["leverage"]))",subtitle:isBacktest ? data["windowId"].text : "\(label) record · Capital deals shown separately",sections:sections)
        case .accounts:
            let b=data["status"]
            out = Content(title:"Accounts",subtitle:"Capital demo only · Arena 01–09",sections:[
                Section(title:"Broker mirror",rows:[Row(id:"mirror",title:b["enabled"].flag ? "Demo orders enabled" : "Demo orders paused",subtitle:"\(number(b["coverage"]["mirrored"].value,digits:0)) assigned · queue \(number(b["queued"].value,digits:0))",badge:b["enabled"].flag ? "Active" : "Paused",action:b["enabled"].flag ? "mirror:off":"mirror:on")]),
                Section(title:"Nine leverage tiers",rows:b["accounts"].items.map { a in Row(id:a["id"].text,title:a["name"].text,subtitle:"\(tier(a["leverage"])) · \(a["runs"].items.count)/\(number(a["slots"].value,digits:0)) slots",badge:a["killed"].flag ? "Kill switch" : "Hedged",stats:[Stat(label:"Equity",value:money(a["equity"].value)),Stat(label:"Balance",value:money(a["balance"].value))],route:Route(screen:.account,id:a["id"].text)) })])
        case .account:
            let a=data["status"]["accounts"].items.first { $0["id"].text == route.id } ?? .null
            out=Content(title:a["name"].text,subtitle:"\(tier(a["leverage"])) · Capital demo account",sections:[
                Section(title:"Account",rows:[Row(id:"equity",title:"Equity \(money(a["equity"].value))",stats:[Stat(label:"Balance",value:money(a["balance"].value)),Stat(label:"Open deals",value:number(a["openDeals"].value,digits:0))])]),
                Section(title:"Assigned strategies",rows:a["runs"].items.map { r in Row(id:r.text,title:r.text.split(separator:":").dropFirst().first.map(String.init) ?? r.text,subtitle:r.text,route:Route(screen:.run,id:r.text,stage:"capital")) }),
                Section(title:"Recent actual deals",rows:data["deals"].items.filter { $0["account_id"].text == route.id }.enumerated().map { i,d in Row(id:"d\(i)",title:"\(d["epic"].text) · \(d["side"].text)",subtitle:"\(d["status"].text) · \(date(d["close_time"].value ?? d["open_time"].value))",body:"P&L \(money(d["pnl"].value))") })])
        case .graveyard:
            let entries=data["entries"].items
            out=Content(title:"Graveyard",subtitle:"Archived agents and platform generations · evidence is preserved",sections:[
                Section(title:"Platform history",rows:data["platform"].items.enumerated().map { i,m in Row(id:"platform\(i)",title:m["name"].text,subtitle:m["date"].text,body:m["description"].text) }),
                Section(title:"\(entries.count) archived versions",rows:entries.map { e in Row(id:e["key"].text,title:e["name"].text,subtitle:"\(e["codeHash"].text) · \(e["runs"].items.count) forward records",body:e["runs"].items.first?["reason"].text ?? "",badge:e["category"].text.capitalized,route:Route(screen:.archive,id:e["key"].text)) })])
        case .archive:
            let e=data["entries"].items.first { $0["key"].text == route.id } ?? .null
            out=Content(title:e["name"].text,subtitle:"\(e["codeHash"].text) · retired \(date(e["endedAt"].value))",sections:[
                Section(title:"Preserved source",rows:e["hasSource"].flag ? [Row(id:"source",title:"Read this exact version",subtitle:e["codeHash"].text,route:Route(screen:.source,id:e["agentId"].text,version:e["codeHash"].text))]:[]),
                Section(title:"Forward history",rows:e["runs"].items.map { r in var row=runRow(r);row.body=r["reason"].text;return row }),
                Section(title:"Backtest history",rows:e["backtests"].items.map {runRow($0,stage:"backtest")})])
        case .status:
            let s=data["status"],e=data["execution"],ticks=s["ticks"],storage=s["tickStorage"]
            out=Content(title:"Platform status",subtitle:s["stream"]["connected"].flag ? "Live Capital feed connected":"Feed reconnecting",sections:[
                Section(title:"Execution",rows:[Row(id:"health",title:"\(number(s["demoRuns"].value,digits:0)) virtual records",stats:[Stat(label:"Memory",value:"\(number(s["memoryMb"].value,digits:0)) MB"),Stat(label:"CPU / core",value:"\(number(e["virtual"]["cpuCorePercent"].value,digits:0))%"),Stat(label:"Pending",value:number(e["virtual"]["pending"].value,digits:0))]),Row(id:"parity",title:"Demo execution",stats:[Stat(label:"HTTP p95",value:"\(number(e["network"]["requestP95Ms"].value,digits:0)) ms"),Stat(label:"Missing closes",value:number(e["parity"]["unpricedCloses"].value,digits:0))])]),
                Section(title:"Model and storage",rows:[Row(id:"model",title:s["forecaster"]["reachable"].flag ? "TimesFM reachable":data["heavyResourcesPaused"].flag ? "TimesFM paused by user":"TimesFM offline",body:"Forecast-based agents wait while the model is unavailable. Trading protections and recording continue."),Row(id:"ticks",title:"\(number(ticks["acknowledged"].value,digits:0)) quotes archived",subtitle:"\(number(ticks["lostTicks"].value,digits:0)) dropped received quotes · one compressed archive",stats:[Stat(label:"Project",value:"\(number(storage["totalBytes"].value.map{$0/1e9},digits:1)) GB"),Stat(label:"2y stress",value:"\(number(storage["stressTwoYearBytes"].value.map{$0/1e9},digits:1)) GB"),Stat(label:"Budget",value:"100 GB")])]),
                Section(title:"Research evidence",rows:[Row(id:"evidence",title:"\(number(data["evidence"]["strategyVariants"].value,digits:0)) strategy variants",body:"Latency copies are correlated; a high rank is not proof of skill.",stats:[Stat(label:"Quote-supported",value:number(data["evidence"]["measuredTrades"].value,digits:0)),Stat(label:"Stored trades",value:number(data["evidence"]["storedTrades"].value,digits:0))])]),
                Section(title:"Recent events",rows:data["events"].items.prefix(30).enumerated().map { i,v in Row(id:"event\(i)",title:v["source"].text,subtitle:date(v["time"].value),body:v["message"].text,badge:v["level"].text) })])
        case .scenarios:
            out=Content(title:"Execution comparisons",subtitle:"Paired strategy copies under frozen latency assumptions. They are excluded from independent verdicts and Capital promotion.",sections:[Section(title:"Virtual cohorts",rows:data["scenarios"].items.sorted{$0["name"].text<$1["name"].text}.map { s in Row(id:s["name"].text,title:s["name"].text,subtitle:"\(number(s["count"].value,digits:0)) virtual records",route:Route(screen:.rankings,stage:"virtual",scenario:s["name"].text)) })])
        case .journal, .document:
            out=Content(title:data["title"].text.isEmpty ? "Journal":data["title"].text,sections:markdown(data["markdown"].text))
        case .research:
            var sections=[Section(title:"Research topics",rows:data["topics"].items.map { t in Row(id:t["slug"].text,title:t["title"].text,route:Route(screen:.document,id:t["slug"].text)) })]
            sections += markdown(data["markdown"].text)
            sections.append(Section(title:"Source library",rows:data["sources"].items.map { s in Row(id:s["id"].text,title:s["title"].text,subtitle:"\(s["topic"].text) · \(s["id"].text)",body:s["summary"].text,route:s["url"].text.isEmpty ? nil:Route(screen:.external,id:s["url"].text)) }))
            out=Content(title:"Research",subtitle:"Mechanisms, evidence and original sources",sections:sections)
        case .source:
            let v=data["versions"].items.first { $0["code_hash"].text == route.version } ?? data["versions"].items.first ?? .null
            let lines=v["source"].text.components(separatedBy:"\n")
            out=Content(title:"Source",subtitle:"\(data["name"].text) · \(v["code_hash"].text)",sections:[Section(title:"Preserved strategy code",rows:stride(from:0,to:lines.count,by:12).map { i in Row(id:"code\(i)",title:"Lines \(i+1)–\(min(i+12,lines.count))",body:lines[i..<min(i+12,lines.count)].joined(separator:"\n"),code:true) })])
        case .more:
            out=Content(title:"Explore",subtitle:"Trader · demo trading agent platform",sections:[Section(title:"Platform",rows:[
                Row(id:"status",title:"Status",subtitle:"Feed, execution, model and storage",route:Route(screen:.status)),
                Row(id:"scenarios",title:"Execution comparisons",subtitle:"Compare frozen latency assumptions",route:Route(screen:.scenarios)),
                Row(id:"graveyard",title:"Graveyard",subtitle:"Archived versions and platform history",route:Route(screen:.graveyard)),
                Row(id:"journal",title:"Journal",subtitle:"Maintenance and strategy decisions",route:Route(screen:.journal)),
                Row(id:"research",title:"Research",subtitle:"Ideas, evidence and source library",route:Route(screen:.research)),
                Row(id:"connection",title:"Connection",subtitle:"This phone’s secure connection",route:Route(screen:.connection))])])
        case .connection:
            out=Content(title:"Connection",subtitle:"Trader connects securely to your existing platform",sections:[Section(title:"Device",rows:[Row(id:"pair",title:"Pair or update connection",body:"A dedicated device key is stored in this iPhone’s Keychain. Trading account passwords stay on the server.",action:"pair"),Row(id:"refresh",title:"Refresh saved data",action:"refresh")])])
        case .external:
            out=Content(title:"Source",sections:[])
        }
        out.sections=out.sections.map { section in Section(title:section.title,rows:section.rows.filter {matches($0,query:query)}) }.filter { !$0.rows.isEmpty }
        out.renderID=out.sections.hashValue
        return out
    }
    static func markdown(_ text:String) -> [Section] {
        var sections:[Section]=[],title="Overview",rows:[Row]=[],paragraph="",index=0
        func flush() { if !paragraph.isEmpty { rows.append(Row(id:"text\(index)",title:"",body:paragraph));index+=1;paragraph="" } }
        for line in text.components(separatedBy:"\n") {
            if line.hasPrefix("#") {
                flush();if !rows.isEmpty {sections.append(Section(title:title,rows:rows));rows=[]}
                title=line.trimmingCharacters(in:CharacterSet(charactersIn:"# "))
            } else if line.isEmpty || paragraph.count+line.count>650 {flush();paragraph=line}
            else {paragraph += (paragraph.isEmpty ? "":"\n")+line}
        }
        flush();if !rows.isEmpty {sections.append(Section(title:title,rows:rows))};return sections
    }
}
