import Foundation
import Security
import SQLite3
import KitCore
import KitNavigation

struct Credentials: Codable, Sendable { var serverURL: String; var token: String }
struct AppState: Codable, Sendable { var selectedTab = 0 }
struct Diagnostic:Codable,Sendable {var screen:String;var record:String;var rows:Int;var refreshed:Double;var source:String;var phase:String}
enum AppDiagnostics {
    static let writer=BackgroundWriter(url:AppFiles.root.appendingPathComponent("diagnostic.json"),label:"trader-diagnostics")
    static func save(route:Route,content:Content,phase:String){
        let source=Bundle.main.object(forInfoDictionaryKey:"TraderSourceRevision") as? String ?? "development"
        writer.save(json:Diagnostic(screen:route.screen.rawValue,record:route.id,rows:content.sections.reduce(0){$0+$1.rows.count},refreshed:content.refreshed,source:source,phase:phase))
    }
}
struct Startup: Sendable { var state: AppState; var contents: [String: Content]; var paired: Bool }
enum TraderError: Error, Equatable { case pairing, unavailable }

enum AppFiles {
    static var root: URL { FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent("Trader",isDirectory:true) }
    static var bootstrap: URL { FileManager.default.urls(for:.documentDirectory,in:.userDomainMask)[0].appendingPathComponent("TraderPairing.json") }
    static func navigation(_ screen:Screen) -> URL { root.appendingPathComponent("navigation-\(screen.rawValue).json") }
    static func key(_ route:Route,_ state:ScreenState) -> String { "\(route.screen.rawValue)|\(route.cacheKey)|\(route.id)|\(route.version)|\(state.query)|\(state.sort)" }
    static let roots = [Route(screen:.rankings),Route(screen:.agents),Route(screen:.accounts),Route(screen:.more)]
}

enum Keychain {
    private static let service = "com.visar.Trader.native-access"
    static func read() -> Credentials? {
        #if targetEnvironment(simulator)
        // Unsigned simulator products have no Keychain access group. This test-only store never ships on a phone.
        return try? DurableFile.readJSON(Credentials.self,from:AppFiles.root.appendingPathComponent("simulator-credential.json"))
        #else
        let q:[String:Any] = [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,kSecAttrAccount as String:"primary",kSecReturnData as String:true,kSecMatchLimit as String:kSecMatchLimitOne]
        var item:CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary,&item)==errSecSuccess,let data=item as? Data else{return nil}
        return try? JSONDecoder().decode(Credentials.self,from:data)
        #endif
    }
    static func save(_ credentials:Credentials) throws {
        guard let url=URL(string:credentials.serverURL),url.scheme=="https",url.host != nil,credentials.token.count>=32 else {throw TraderError.pairing}
        #if targetEnvironment(simulator)
        let path=AppFiles.root.appendingPathComponent("simulator-credential.json")
        try DurableFile.writeJSON(credentials,to:path)
        try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:path.path)
        #else
        let q:[String:Any] = [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,kSecAttrAccount as String:"primary"]
        let data=try JSONEncoder().encode(credentials)
        let status=SecItemUpdate(q as CFDictionary,[kSecValueData as String:data] as CFDictionary)
        if status==errSecItemNotFound {
            var add=q;add[kSecValueData as String]=data;add[kSecAttrAccessible as String]=kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            guard SecItemAdd(add as CFDictionary,nil)==errSecSuccess else {throw TraderError.pairing}
        } else if status != errSecSuccess {throw TraderError.pairing}
        #endif
    }
}

/**
 * The phone's copy of every screen it has shown: one SQLite row per screen holding the server's bytes, their
 * version (ETag) and when the server last confirmed them. A refresh rewrites only that row (or, unchanged, only
 * its time); opening a screen reads only its row. WAL journaling keeps it intact through a kill or power loss.
 */
final class TraderDB {
    private var db:OpaquePointer?
    private static let transient=unsafeBitCast(-1,to:sqlite3_destructor_type.self)
    init(url:URL) {
        try? FileManager.default.createDirectory(at:url.deletingLastPathComponent(),withIntermediateDirectories:true)
        if sqlite3_open_v2(url.path,&db,SQLITE_OPEN_READWRITE|SQLITE_OPEN_CREATE|SQLITE_OPEN_NOMUTEX,nil) != SQLITE_OK {sqlite3_close(db);db=nil;return}
        sqlite3_exec(db,"""
        PRAGMA journal_mode=WAL;PRAGMA synchronous=NORMAL;
        CREATE TABLE IF NOT EXISTS screen(key TEXT PRIMARY KEY,rev TEXT NOT NULL,fetched REAL NOT NULL,body BLOB NOT NULL) WITHOUT ROWID;
        CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY,value BLOB NOT NULL) WITHOUT ROWID;
        """,nil,nil,nil)
    }
    deinit {sqlite3_close(db)}
    private func run(_ sql:String,_ bind:(OpaquePointer)->Void,_ read:((OpaquePointer)->Void)?=nil) {
        var stmt:OpaquePointer?
        guard let db,sqlite3_prepare_v2(db,sql,-1,&stmt,nil)==SQLITE_OK,let stmt else{return}
        defer{sqlite3_finalize(stmt)}
        bind(stmt)
        if let read {if sqlite3_step(stmt)==SQLITE_ROW {read(stmt)}} else {_=sqlite3_step(stmt)}
    }
    private func text(_ s:OpaquePointer,_ i:Int32,_ v:String){sqlite3_bind_text(s,i,v,-1,TraderDB.transient)}
    private func blob(_ s:OpaquePointer,_ i:Int32,_ v:Data){_=v.withUnsafeBytes{sqlite3_bind_blob(s,i,$0.baseAddress,Int32(v.count),TraderDB.transient)}}
    private func data(_ s:OpaquePointer,_ i:Int32)->Data{guard let p=sqlite3_column_blob(s,i) else{return Data()};return Data(bytes:p,count:Int(sqlite3_column_bytes(s,i)))}
    func screen(_ key:String)->(rev:String,fetched:Double,body:Data)? {
        var out:(String,Double,Data)?
        run("SELECT rev,fetched,body FROM screen WHERE key=?",{self.text($0,1,key)}){s in out=(String(cString:sqlite3_column_text(s,0)),sqlite3_column_double(s,1),self.data(s,2))}
        return out
    }
    func save(_ key:String,rev:String,fetched:Double,body:Data) {
        run("INSERT INTO screen(key,rev,fetched,body) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET rev=excluded.rev,fetched=excluded.fetched,body=excluded.body",{s in self.text(s,1,key);self.text(s,2,rev);sqlite3_bind_double(s,3,fetched);self.blob(s,4,body)})
        // Bounded: the 400 most recently confirmed screens stay on the phone.
        sqlite3_exec(db,"DELETE FROM screen WHERE key NOT IN (SELECT key FROM screen ORDER BY fetched DESC LIMIT 400)",nil,nil,nil)
    }
    func confirm(_ key:String,fetched:Double){run("UPDATE screen SET fetched=? WHERE key=?",{s in sqlite3_bind_double(s,1,fetched);self.text(s,2,key)})}
    func value(_ key:String)->Data?{var out:Data?;run("SELECT value FROM kv WHERE key=?",{self.text($0,1,key)}){s in out=self.data(s,0)};return out}
    func set(_ key:String,_ value:Data){run("INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",{s in self.text(s,1,key);self.blob(s,2,value)})}
}

actor TraderStore {
    static let shared = TraderStore()
    private var credentials:Credentials?
    private var db:TraderDB?
    /** Decoded screens kept in memory, so back, forward and re-sorting do not decode again. */
    private var decoded:[String:Content]=[:]
    private var recent:[String]=[]
    private let session:URLSession
    private var offline = false
    init() {
        let config=URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest=20;config.timeoutIntervalForResource=30
        config.httpCookieStorage=nil;config.urlCache=nil;config.requestCachePolicy = .reloadIgnoringLocalCacheData
        session=URLSession(configuration:config)
    }
    func bootstrap() -> Startup {
        credentials=Keychain.read()
        if let seed=try? DurableFile.readJSON(Credentials.self,from:AppFiles.bootstrap) {
            do {try Keychain.save(seed);credentials=seed;try FileManager.default.removeItem(at:AppFiles.bootstrap)} catch {}
        }
        let db=TraderDB(url:AppFiles.root.appendingPathComponent("trader.sqlite"));self.db=db
        // Before November 2026 every response lived in one JSON file rewritten on each refresh, and the selected
        // tab in another; neither is read any more.
        var state=(db.value("app").flatMap{try? JSONDecoder().decode(AppState.self,from:$0)}) ?? AppState()
        let legacy=AppFiles.root.appendingPathComponent("app-state.json")
        if let old=try? DurableFile.readJSON(AppState.self,from:legacy) {state=old;if let data=try? JSONEncoder().encode(old){db.set("app",data)}}
        for name in ["responses.json","app-state.json","navigation-0.json","navigation-1.json","navigation-2.json","navigation-3.json","navigation-4.json"] {try? FileManager.default.removeItem(at:AppFiles.root.appendingPathComponent(name))}
        // The first frame needs each tab's visible screen; the screens under them load when they are rebuilt.
        var contents:[String:Content]=[:]
        for root in AppFiles.roots {
            var entries=[SavedStack.Entry(route:(try? JSONEncoder().encode(root)) ?? Data(),state:nil)]
            if let stack=try? DurableFile.readJSON(SavedStack.self,from:AppFiles.navigation(root.screen)),let top=stack.back.last {entries.append(top)}
            for entry in entries {
                guard let route=try? JSONDecoder().decode(Route.self,from:entry.route) else{continue}
                let screenState=entry.state.flatMap{try? JSONDecoder().decode(ScreenState.self,from:$0)} ?? ScreenState()
                contents[AppFiles.key(route,screenState)]=cachedContent(route,state:screenState)
            }
        }
        return Startup(state:state,contents:contents,paired:credentials != nil)
    }
    func saveTab(_ index:Int){if let data=try? JSONEncoder().encode(AppState(selectedTab:index)){db?.set("app",data)}}
    private func stored(_ key:String)->Content? {
        if let c=decoded[key] {return c}
        guard let row=db?.screen(key),var c=try? JSONDecoder().decode(Content.self,from:row.body) else{return nil}
        c.rev=row.rev;c.refreshed=row.fetched;remember(key,c);return c
    }
    private func remember(_ key:String,_ c:Content) {
        decoded[key]=c;recent.removeAll{$0==key};recent.append(key)
        while recent.count>16 {decoded.removeValue(forKey:recent.removeFirst())}
    }
    func cachedContent(_ route:Route,state:ScreenState) -> Content {
        if let local=Presentation.local(route) {return local}
        guard let c=stored(route.cacheKey) else{return Content(title:route.title.isEmpty ? route.screen.rawValue.capitalized:route.title,sections:[])}
        return Presentation.view(c,route:route,query:state.query,sort:state.sort)
    }
    func content(_ route:Route,state:ScreenState,refresh:Bool) async throws -> Content {
        let key=route.cacheKey
        if refresh && !key.isEmpty {
            guard !offline else{throw TraderError.unavailable}
            guard let credentials else{throw TraderError.pairing}
            guard let url=URL(string:credentials.serverURL.trimmingCharacters(in:CharacterSet(charactersIn:"/"))+"/api/native/v2/"+key) else{throw TraderError.unavailable}
            var request=URLRequest(url:url)
            request.setValue("Bearer \(credentials.token)",forHTTPHeaderField:"Authorization")
            request.setValue("application/json",forHTTPHeaderField:"Accept")
            let known=stored(key)
            if let rev=known?.rev,!rev.isEmpty {request.setValue(rev,forHTTPHeaderField:"If-None-Match")}
            let (data,response)=try await session.data(for:request)
            guard let http=response as? HTTPURLResponse else{throw TraderError.unavailable}
            if http.statusCode==401{throw TraderError.pairing}
            let now=Date().timeIntervalSince1970*1000
            if http.statusCode==304,var c=known {c.refreshed=now;remember(key,c);db?.confirm(key,fetched:now)}
            else {
                guard http.statusCode==200,var c=try? JSONDecoder().decode(Content.self,from:data) else{throw TraderError.unavailable}
                c.rev=http.value(forHTTPHeaderField:"ETag") ?? "";c.refreshed=now
                remember(key,c);db?.save(key,rev:c.rev,fetched:now,body:data)
            }
        }
        return cachedContent(route,state:state)
    }
    func pair(server:String,token:String) throws {
        let c=Credentials(serverURL:server.trimmingCharacters(in:.whitespacesAndNewlines),token:token.trimmingCharacters(in:.whitespacesAndNewlines))
        try Keychain.save(c);credentials=c
    }
    func mutate(_ action:String) async throws {
        guard let credentials else{throw TraderError.pairing}
        let parts=action.split(separator:":",maxSplits:2).map(String.init)
        guard parts.count>=2,["mirror","exclude"].contains(parts[0]) else{throw TraderError.unavailable}
        guard let url=URL(string:credentials.serverURL.trimmingCharacters(in:CharacterSet(charactersIn:"/"))+"/api/native/v2/"+parts[0]) else{throw TraderError.unavailable}
        var r=URLRequest(url:url);r.httpMethod="POST";r.setValue("application/json",forHTTPHeaderField:"Content-Type")
        r.setValue("Bearer \(credentials.token)",forHTTPHeaderField:"Authorization")
        struct Mirror:Encodable{var enabled:Bool}
        struct Exclude:Encodable{var runId:String;var excluded:Bool}
        if parts[0]=="mirror" {r.httpBody=try JSONEncoder().encode(Mirror(enabled:parts[1]=="on"))}
        else {
            guard parts.count==3 else{throw TraderError.unavailable}
            r.httpBody=try JSONEncoder().encode(Exclude(runId:parts[2],excluded:parts[1]=="true"))
        }
        let (_,response)=try await session.data(for:r)
        guard (response as? HTTPURLResponse)?.statusCode==200 else{throw TraderError.unavailable}
    }
    /** SQLite commits each write; nothing is pending when the app is backgrounded. */
    func flush(){}
    func setOffline(_ value:Bool){offline=value}
}
