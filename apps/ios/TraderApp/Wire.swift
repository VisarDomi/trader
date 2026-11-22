import Foundation

// Screens arrive built by the server (apps/ui/src/lib/server/native/wire.ts): the phone stores the bytes as they
// came and draws them. Empty fields are omitted on the wire, so every field here has a default. Chart series are
// packed little-endian arrays in base64: times Float64 (epoch ms), values Float32.

extension KeyedDecodingContainer {
    func field<T:Decodable>(_ key:Key,_ fallback:T)->T {(try? decodeIfPresent(T.self,forKey:key)) ?? fallback}
}
enum Packed {
    static func doubles(_ text:String?)->[Double] {
        guard let text,let data=Data(base64Encoded:text),data.count%8==0 else{return []}
        var out=[Double](repeating:0,count:data.count/8)
        _=out.withUnsafeMutableBytes{data.copyBytes(to:$0)}
        return out
    }
    static func floats(_ text:String?)->[Double] {
        guard let text,let data=Data(base64Encoded:text),data.count%4==0 else{return []}
        var out=[Float](repeating:0,count:data.count/4)
        _=out.withUnsafeMutableBytes{data.copyBytes(to:$0)}
        return out.map(Double.init)
    }
}

struct Stat:Decodable,Sendable,Hashable {
    var label:String;var value:String;var tone=0
    init(label:String,value:String,tone:Int=0){self.label=label;self.value=value;self.tone=tone}
    enum CodingKeys:String,CodingKey{case label,value,tone}
    init(from d:Decoder) throws {let c=try d.container(keyedBy:CodingKeys.self);label=c.field(.label,"");value=c.field(.value,"");tone=c.field(.tone,0)}
}
/** One series: times (empty = evenly spaced over the graph's window) and values (NaN = no observation). */
struct GraphSeries:Decodable,Sendable,Hashable {
    var name:String;var t:[Double];var v:[Double]
    init(name:String,t:[Double],v:[Double]){self.name=name;self.t=t;self.v=v}
    enum CodingKeys:String,CodingKey{case name,t,v}
    init(from d:Decoder) throws {let c=try d.container(keyedBy:CodingKeys.self);name=c.field(.name,"");t=Packed.doubles(c.field(.t,nil as String?));v=Packed.floats(c.field(.v,nil as String?))}
}
struct GraphMarker:Decodable,Sendable,Hashable {
    var t:Double;var value:Double?;var label:String;var detail="";var tone=0
    enum CodingKeys:String,CodingKey{case t,value,label,detail,tone}
    init(t:Double,value:Double?,label:String,detail:String="",tone:Int=0){self.t=t;self.value=value;self.label=label;self.detail=detail;self.tone=tone}
    init(from d:Decoder) throws {let c=try d.container(keyedBy:CodingKeys.self);t=c.field(.t,0);value=c.field(.value,nil as Double?);label=c.field(.label,"");detail=c.field(.detail,"");tone=c.field(.tone,0)}
}
struct GraphGuide:Decodable,Sendable,Hashable {
    var label:String;var value:Double;var tone=0
    enum CodingKeys:String,CodingKey{case label,value,tone}
    init(label:String,value:Double,tone:Int=0){self.label=label;self.value=value;self.tone=tone}
    init(from d:Decoder) throws {let c=try d.container(keyedBy:CodingKeys.self);label=c.field(.label,"");value=c.field(.value,0);tone=c.field(.tone,0)}
}
struct GraphBar:Decodable,Sendable,Hashable {
    var name:String;var value:Double;var total=false
    enum CodingKeys:String,CodingKey{case name,value,total}
    init(from d:Decoder) throws {let c=try d.container(keyedBy:CodingKeys.self);name=c.field(.name,"");value=c.field(.value,0);total=c.field(.total,false)}
}
struct GraphGap:Decodable,Sendable,Hashable {var from:Double;var through:Double}
struct GraphMeter:Decodable,Sendable,Hashable {
    var value:Double;var limit:Double;var above:Bool;var price=false
    enum CodingKeys:String,CodingKey{case value,limit,above,price}
    init(from d:Decoder) throws {let c=try d.container(keyedBy:CodingKeys.self);value=c.field(.value,0);limit=c.field(.limit,0);above=c.field(.above,false);price=c.field(.price,false)}
}
struct GraphCandles:Decodable,Sendable,Hashable {
    var t:[Double]=[],open:[Double]=[],high:[Double]=[],low:[Double]=[],close:[Double]=[]
    enum CodingKeys:String,CodingKey{case t,o,h,l,c}
    init(from d:Decoder) throws {
        let x=try d.container(keyedBy:CodingKeys.self)
        t=Packed.doubles(x.field(.t,nil as String?));open=Packed.floats(x.field(.o,nil as String?));high=Packed.floats(x.field(.h,nil as String?))
        low=Packed.floats(x.field(.l,nil as String?));close=Packed.floats(x.field(.c,nil as String?))
        let n=[t.count,open.count,high.count,low.count,close.count].min() ?? 0
        t=Array(t.prefix(n));open=Array(open.prefix(n));high=Array(high.prefix(n));low=Array(low.prefix(n));close=Array(close.prefix(n))
    }
    var count:Int{t.count}
}
struct Graph:Decodable,Sendable,Hashable {
    var kind="line",unit="",precision=2,height:Double=220
    var from:Double?=nil,through:Double?=nil
    var series:[GraphSeries]=[],markers:[GraphMarker]=[],guides:[GraphGuide]=[],bars:[GraphBar]=[],gaps:[GraphGap]=[]
    var candles:GraphCandles?=nil,meter:GraphMeter?=nil
    init(){}
    enum CodingKeys:String,CodingKey{case kind,unit,precision,height,from,through,series,markers,guides,bars,gaps,candles,meter}
    init(from d:Decoder) throws {
        let c=try d.container(keyedBy:CodingKeys.self)
        kind=c.field(.kind,"line");unit=c.field(.unit,"");precision=c.field(.precision,2);height=c.field(.height,220)
        from=c.field(.from,nil as Double?);through=c.field(.through,nil as Double?)
        series=c.field(.series,[]);markers=c.field(.markers,[]);guides=c.field(.guides,[]);bars=c.field(.bars,[]);gaps=c.field(.gaps,[])
        candles=c.field(.candles,nil as GraphCandles?);meter=c.field(.meter,nil as GraphMeter?)
    }
}
struct Row:Decodable,Sendable {
    var id:String;var title:String;var subtitle="";var body="";var badge="";var badgeTone:Int?=nil
    var stats:[Stat]=[];var route:Route?=nil;var action="";var code=false;var chart:Graph?=nil
    /** Rankings sort keys, in the order of the screen's sort labels; nil sorts last. */
    var keys:[Double?]=[]
    init(id:String,title:String,subtitle:String="",body:String="",route:Route?=nil,action:String=""){self.id=id;self.title=title;self.subtitle=subtitle;self.body=body;self.route=route;self.action=action}
    enum CodingKeys:String,CodingKey{case id,title,subtitle,body,badge,badgeTone,stats,route,action,code,chart,keys}
    init(from d:Decoder) throws {
        let c=try d.container(keyedBy:CodingKeys.self)
        id=c.field(.id,"");title=c.field(.title,"");subtitle=c.field(.subtitle,"");body=c.field(.body,"");badge=c.field(.badge,"");badgeTone=c.field(.badgeTone,nil as Int?)
        stats=c.field(.stats,[]);route=c.field(.route,nil as Route?);action=c.field(.action,"");code=c.field(.code,false);chart=c.field(.chart,nil as Graph?);keys=c.field(.keys,[])
    }
}
struct Section:Decodable,Sendable {
    var title:String;var rows:[Row]
    init(title:String,rows:[Row]){self.title=title;self.rows=rows}
    enum CodingKeys:String,CodingKey{case title,rows}
    init(from d:Decoder) throws {let c=try d.container(keyedBy:CodingKeys.self);title=c.field(.title,"");rows=c.field(.rows,[])}
}
/** A decoded screen, plus where it came from: the server's version (ETag) and when it was confirmed. */
struct Content:Decodable,Sendable {
    var title:String;var subtitle="";var sections:[Section];var sort:[String]=[]
    var rev="";var refreshed:Double=0
    init(title:String,subtitle:String="",sections:[Section]){self.title=title;self.subtitle=subtitle;self.sections=sections}
    enum CodingKeys:String,CodingKey{case v,title,subtitle,sections,sort}
    init(from d:Decoder) throws {
        let c=try d.container(keyedBy:CodingKeys.self)
        guard c.field(.v,0)==2 else{throw DecodingError.dataCorruptedError(forKey:.v,in:c,debugDescription:"Unsupported screen version")}
        title=c.field(.title,"");subtitle=c.field(.subtitle,"");sections=c.field(.sections,[]);sort=c.field(.sort,[])
    }
}
