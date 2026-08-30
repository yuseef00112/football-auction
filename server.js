const http=require("http"),fs=require("fs"),path=require("path"),https=require("https"),crypto=require("crypto"),{EventEmitter}=require("events");

/* Minimal built-in WebSocket server: no npm package is required. */
class SimpleWebSocket extends EventEmitter{
  constructor(socket){
    super();
    this.socket=socket;
    this.readyState=1;
    this.buffer=Buffer.alloc(0);
    socket.on("data",d=>this._push(d));
    socket.on("close",()=>this._close());
    socket.on("end",()=>this._close());
    socket.on("error",()=>this._close());
  }
  _close(){
    if(this.readyState===3)return;
    this.readyState=3;
    this.emit("close");
  }
  _push(chunk){
    if(this.readyState!==1)return;
    this.buffer=Buffer.concat([this.buffer,Buffer.from(chunk)]);
    this._parse();
  }
  _parse(){
    let offset=0;
    while(true){
      const start=offset;
      if(this.buffer.length-offset<2)break;
      const b1=this.buffer[offset++], b2=this.buffer[offset++];
      const fin=!!(b1&128), opcode=b1&15, masked=!!(b2&128);
      let len=b2&127;
      if(len===126){
        if(this.buffer.length-offset<2){offset=start;break;}
        len=this.buffer.readUInt16BE(offset); offset+=2;
      }else if(len===127){
        if(this.buffer.length-offset<8){offset=start;break;}
        const n=this.buffer.readBigUInt64BE(offset); offset+=8;
        if(n>BigInt(Number.MAX_SAFE_INTEGER)){this.close();return;}
        len=Number(n);
      }
      if(!masked){ this.close(); return; }
      if(this.buffer.length-offset<4){offset=start;break;}
      const mask=this.buffer.subarray(offset,offset+4); offset+=4;
      if(this.buffer.length-offset<len){offset=start;break;}
      const payload=Buffer.from(this.buffer.subarray(offset,offset+len)); offset+=len;
      for(let i=0;i<payload.length;i++)payload[i]^=mask[i%4];

      if(!fin){ this.close(); return; } // this game only needs small, unfragmented JSON frames
      if(opcode===8){ this.close(); return; }
      if(opcode===9){ this._frame(payload,10); continue; }
      if(opcode===1)this.emit("message",payload.toString("utf8"));
    }
    this.buffer=this.buffer.subarray(offset);
  }
  _frame(payload,opcode=1){
    if(this.readyState!==1)return;
    const p=Buffer.isBuffer(payload)?payload:Buffer.from(String(payload));
    let head;
    if(p.length<126){
      head=Buffer.alloc(2);head[0]=128|opcode;head[1]=p.length;
    }else if(p.length<=65535){
      head=Buffer.alloc(4);head[0]=128|opcode;head[1]=126;head.writeUInt16BE(p.length,2);
    }else{
      head=Buffer.alloc(10);head[0]=128|opcode;head[1]=127;head.writeBigUInt64BE(BigInt(p.length),2);
    }
    try{this.socket.write(Buffer.concat([head,p]));}catch(e){this._close();}
  }
  send(data){this._frame(data,1);}
  close(){
    if(this.readyState===3)return;
    try{this._frame(Buffer.alloc(0),8);this.socket.end();}catch(e){}
    this._close();
  }
}
class SimpleWebSocketServer extends EventEmitter{
  constructor({server}){
    super();this.clients=new Set();
    server.on("upgrade",(req,socket)=>{
      const key=req.headers["sec-websocket-key"];
      const upgrade=String(req.headers.upgrade||"").toLowerCase();
      if(!key||upgrade!=="websocket"){socket.destroy();return;}
      const accept=crypto.createHash("sha1")
        .update(key+"258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
        .digest("base64");
      socket.write(
        "HTTP/1.1 101 Switching Protocols\r\n"+
        "Upgrade: websocket\r\n"+
        "Connection: Upgrade\r\n"+
        "Sec-WebSocket-Accept: "+accept+"\r\n\r\n"
      );
      const ws=new SimpleWebSocket(socket);
      this.clients.add(ws);
      ws.on("close",()=>this.clients.delete(ws));
      this.emit("connection",ws,req);
    });
  }
}
const WebSocket={Server:SimpleWebSocketServer};
const PORT=process.env.PORT||3000, rooms=new Map(), photoCache=new Map();
const profilesFile=path.join(__dirname,"profiles.json");
let profiles={};try{profiles=JSON.parse(fs.readFileSync(profilesFile,"utf8"))}catch(e){profiles={}}
function saveProfiles(){try{fs.writeFileSync(profilesFile,JSON.stringify(profiles,null,2))}catch(e){}}
function profileKey(p){return p.profileId||p.name||"لاعب"}
function touchProfile(p){const k=profileKey(p);profiles[k]||={name:p.name||"لاعب",photo:p.photo||"",matches:0,wins:0,losses:0,draws:0,points:0};profiles[k].name=p.name||profiles[k].name;profiles[k].photo=p.photo||profiles[k].photo||"";return profiles[k]}
function leaderboard(){return Object.entries(profiles).map(([id,p])=>({id,...p})).sort((a,b)=>b.points-a.points||b.wins-a.wins||a.losses-b.losses)}
function publicRooms(){return [...rooms.entries()].filter(([_,r])=>r.phase==="lobby").map(([code,r])=>{const host=[...r.players.values()][0];return {code,owner:host?.name||"لاعب",mode:r.mode,teamSize:r.teamSize,budget:r.startBudget,count:r.players.size}})}
function broadcastRooms(){const msg=JSON.stringify({type:"publicRooms",rooms:publicRooms()});for(const client of wss.clients)if(client.readyState===1)client.send(msg)}
const players=[{"id":1,"name":"Kylian Mbappe","position":"ST","club":"Real Madrid","country":"France","overall":91,"pace":34,"shooting":95,"passing":92,"dribbling":90,"defending":91,"physical":78,"stamina":88,"tier":"Elite","basePrice":10,"retired":false},{"id":2,"name":"Erling Haaland","position":"ST","club":"Manchester City","country":"Norway","overall":91,"pace":36,"shooting":96,"passing":90,"dribbling":80,"defending":86,"physical":92,"stamina":93,"tier":"Elite","basePrice":10,"retired":false},{"id":3,"name":"Vinicius Junior","position":"LW","club":"Real Madrid","country":"Brazil","overall":90,"pace":35,"shooting":96,"passing":88,"dribbling":91,"defending":93,"physical":70,"stamina":82,"tier":"Elite","basePrice":10,"retired":false},{"id":4,"name":"Jude Bellingham","position":"CM","club":"Real Madrid","country":"England","overall":90,"pace":34,"shooting":88,"passing":85,"dribbling":91,"defending":90,"physical":82,"stamina":88,"tier":"Elite","basePrice":10,"retired":false},{"id":5,"name":"Mohamed Salah","position":"RW","club":"Liverpool","country":"Egypt","overall":89,"pace":31,"shooting":90,"passing":90,"dribbling":88,"defending":91,"physical":58,"stamina":78,"tier":"Elite","basePrice":10,"retired":false},{"id":6,"name":"Harry Kane","position":"ST","club":"Bayern Munich","country":"England","overall":89,"pace":30,"shooting":84,"passing":94,"dribbling":88,"defending":82,"physical":48,"stamina":85,"tier":"Elite","basePrice":10,"retired":false},{"id":7,"name":"Rodri","position":"CDM","club":"Manchester City","country":"Spain","overall":90,"pace":32,"shooting":72,"passing":84,"dribbling":94,"defending":78,"physical":90,"stamina":92,"tier":"Elite","basePrice":10,"retired":false},{"id":8,"name":"Kevin De Bruyne","position":"CM","club":"Manchester City","country":"Belgium","overall":88,"pace":29,"shooting":74,"passing":86,"dribbling":96,"defending":87,"physical":62,"stamina":78,"tier":"Elite","basePrice":10,"retired":false},{"id":9,"name":"Lamine Yamal","position":"RW","club":"Barcelona","country":"Spain","overall":89,"pace":28,"shooting":95,"passing":82,"dribbling":91,"defending":94,"physical":50,"stamina":70,"tier":"Elite","basePrice":10,"retired":false},{"id":10,"name":"Bukayo Saka","position":"RW","club":"Arsenal","country":"England","overall":88,"pace":28,"shooting":91,"passing":86,"dribbling":88,"defending":91,"physical":55,"stamina":78,"tier":"Elite","basePrice":10,"retired":false},{"id":11,"name":"Phil Foden","position":"AM","club":"Manchester City","country":"England","overall":88,"pace":27,"shooting":88,"passing":85,"dribbling":91,"defending":92,"physical":52,"stamina":75,"tier":"Elite","basePrice":10,"retired":false},{"id":12,"name":"Florian Wirtz","position":"AM","club":"Liverpool","country":"Germany","overall":88,"pace":27,"shooting":82,"passing":82,"dribbling":94,"defending":91,"physical":55,"stamina":73,"tier":"Elite","basePrice":10,"retired":false},{"id":13,"name":"Pedri","position":"CM","club":"Barcelona","country":"Spain","overall":87,"pace":25,"shooting":76,"passing":76,"dribbling":95,"defending":90,"physical":58,"stamina":75,"tier":"Strong","basePrice":10,"retired":false},{"id":14,"name":"Federico Valverde","position":"CM","club":"Real Madrid","country":"Uruguay","overall":88,"pace":30,"shooting":91,"passing":82,"dribbling":88,"defending":84,"physical":76,"stamina":94,"tier":"Elite","basePrice":10,"retired":false},{"id":15,"name":"Martin Odegaard","position":"AM","club":"Arsenal","country":"Norway","overall":87,"pace":24,"shooting":72,"passing":78,"dribbling":94,"defending":89,"physical":56,"stamina":74,"tier":"Strong","basePrice":10,"retired":false},{"id":16,"name":"Declan Rice","position":"CDM","club":"Arsenal","country":"England","overall":87,"pace":25,"shooting":79,"passing":78,"dribbling":87,"defending":78,"physical":91,"stamina":90,"tier":"Strong","basePrice":10,"retired":false},{"id":17,"name":"William Saliba","position":"CB","club":"Arsenal","country":"France","overall":87,"pace":22,"shooting":78,"passing":65,"dribbling":74,"defending":72,"physical":91,"stamina":90,"tier":"Strong","basePrice":10,"retired":false},{"id":18,"name":"Virgil van Dijk","position":"CB","club":"Liverpool","country":"Netherlands","overall":87,"pace":18,"shooting":74,"passing":75,"dribbling":78,"defending":71,"physical":91,"stamina":88,"tier":"Strong","basePrice":10,"retired":false},{"id":19,"name":"Antonio Rudiger","position":"CB","club":"Real Madrid","country":"Germany","overall":86,"pace":17,"shooting":79,"passing":65,"dribbling":69,"defending":68,"physical":90,"stamina":92,"tier":"Strong","basePrice":9,"retired":false},{"id":20,"name":"Alisson Becker","position":"GK","club":"Liverpool","country":"Brazil","overall":89,"pace":20,"shooting":58,"passing":55,"dribbling":70,"defending":72,"physical":93,"stamina":86,"tier":"Elite","basePrice":10,"retired":false},{"id":21,"name":"Thibaut Courtois","position":"GK","club":"Real Madrid","country":"Belgium","overall":89,"pace":19,"shooting":55,"passing":52,"dribbling":68,"defending":70,"physical":95,"stamina":84,"tier":"Elite","basePrice":10,"retired":false},{"id":22,"name":"Jan Oblak","position":"GK","club":"Atletico Madrid","country":"Slovenia","overall":87,"pace":17,"shooting":51,"passing":48,"dribbling":65,"defending":62,"physical":94,"stamina":79,"tier":"Strong","basePrice":10,"retired":false},{"id":23,"name":"Achraf Hakimi","position":"RB","club":"PSG","country":"Morocco","overall":86,"pace":27,"shooting":94,"passing":68,"dribbling":80,"defending":87,"physical":78,"stamina":93,"tier":"Strong","basePrice":9,"retired":false},{"id":24,"name":"Theo Hernandez","position":"LB","club":"AC Milan","country":"France","overall":86,"pace":25,"shooting":96,"passing":72,"dribbling":77,"defending":86,"physical":76,"stamina":92,"tier":"Strong","basePrice":9,"retired":false},{"id":25,"name":"Rafael Leao","position":"LW","club":"AC Milan","country":"Portugal","overall":86,"pace":26,"shooting":95,"passing":85,"dribbling":78,"defending":91,"physical":58,"stamina":84,"tier":"Strong","basePrice":9,"retired":false},{"id":26,"name":"Khvicha Kvaratskhelia","position":"LW","club":"PSG","country":"Georgia","overall":86,"pace":25,"shooting":91,"passing":82,"dribbling":84,"defending":93,"physical":48,"stamina":78,"tier":"Strong","basePrice":9,"retired":false},{"id":27,"name":"Nico Williams","position":"LW","club":"Athletic Club","country":"Spain","overall":85,"pace":25,"shooting":96,"passing":78,"dribbling":80,"defending":91,"physical":52,"stamina":83,"tier":"Strong","basePrice":9,"retired":false},{"id":28,"name":"Ousmane Dembele","position":"RW","club":"PSG","country":"France","overall":87,"pace":29,"shooting":97,"passing":82,"dribbling":86,"defending":94,"physical":45,"stamina":76,"tier":"Strong","basePrice":10,"retired":false},{"id":29,"name":"Lautaro Martinez","position":"ST","club":"Inter","country":"Argentina","overall":88,"pace":27,"shooting":84,"passing":92,"dribbling":78,"defending":86,"physical":55,"stamina":89,"tier":"Elite","basePrice":10,"retired":false},{"id":30,"name":"Victor Osimhen","position":"ST","club":"Galatasaray","country":"Nigeria","overall":86,"pace":28,"shooting":96,"passing":91,"dribbling":70,"defending":82,"physical":60,"stamina":94,"tier":"Strong","basePrice":9,"retired":false},{"id":31,"name":"Robert Lewandowski","position":"ST","club":"Barcelona","country":"Poland","overall":88,"pace":27,"shooting":77,"passing":94,"dribbling":83,"defending":83,"physical":45,"stamina":83,"tier":"Elite","basePrice":10,"retired":false},{"id":32,"name":"Antoine Griezmann","position":"AM","club":"Atletico Madrid","country":"France","overall":87,"pace":28,"shooting":80,"passing":88,"dribbling":88,"defending":87,"physical":62,"stamina":78,"tier":"Strong","basePrice":10,"retired":false},{"id":33,"name":"Bernardo Silva","position":"AM","club":"Manchester City","country":"Portugal","overall":87,"pace":25,"shooting":82,"passing":78,"dribbling":94,"defending":95,"physical":52,"stamina":73,"tier":"Strong","basePrice":10,"retired":false},{"id":34,"name":"Bruno Fernandes","position":"AM","club":"Manchester United","country":"Portugal","overall":87,"pace":28,"shooting":73,"passing":86,"dribbling":92,"defending":88,"physical":48,"stamina":75,"tier":"Strong","basePrice":10,"retired":false},{"id":35,"name":"Joshua Kimmich","position":"CDM","club":"Bayern Munich","country":"Germany","overall":86,"pace":26,"shooting":76,"passing":71,"dribbling":91,"defending":84,"physical":81,"stamina":81,"tier":"Strong","basePrice":9,"retired":false},{"id":36,"name":"Trent Alexander-Arnold","position":"RB","club":"Liverpool","country":"England","overall":86,"pace":27,"shooting":78,"passing":69,"dribbling":95,"defending":86,"physical":62,"stamina":80,"tier":"Strong","basePrice":9,"retired":false},{"id":37,"name":"Alphonso Davies","position":"LB","club":"Bayern Munich","country":"Canada","overall":84,"pace":25,"shooting":97,"passing":63,"dribbling":78,"defending":86,"physical":68,"stamina":91,"tier":"Strong","basePrice":9,"retired":false},{"id":38,"name":"Gabriel Magalhaes","position":"CB","club":"Arsenal","country":"Brazil","overall":85,"pace":20,"shooting":69,"passing":67,"dribbling":72,"defending":70,"physical":90,"stamina":87,"tier":"Strong","basePrice":9,"retired":false},{"id":39,"name":"Marquinhos","position":"CB","club":"PSG","country":"Brazil","overall":85,"pace":22,"shooting":76,"passing":67,"dribbling":78,"defending":75,"physical":89,"stamina":83,"tier":"Strong","basePrice":9,"retired":false},{"id":40,"name":"Ronald Araujo","position":"CB","club":"Barcelona","country":"Uruguay","overall":85,"pace":24,"shooting":84,"passing":62,"dribbling":71,"defending":70,"physical":91,"stamina":91,"tier":"Strong","basePrice":9,"retired":false},{"id":41,"name":"Ruben Dias","position":"CB","club":"Manchester City","country":"Portugal","overall":86,"pace":19,"shooting":71,"passing":64,"dribbling":75,"defending":68,"physical":93,"stamina":84,"tier":"Strong","basePrice":9,"retired":false},{"id":42,"name":"Mike Maignan","position":"GK","club":"AC Milan","country":"France","overall":87,"pace":20,"shooting":61,"passing":51,"dribbling":69,"defending":70,"physical":92,"stamina":91,"tier":"Strong","basePrice":10,"retired":false},{"id":43,"name":"Ederson","position":"GK","club":"Manchester City","country":"Brazil","overall":86,"pace":23,"shooting":61,"passing":54,"dribbling":84,"defending":82,"physical":90,"stamina":88,"tier":"Strong","basePrice":9,"retired":false},{"id":44,"name":"Emiliano Martinez","position":"GK","club":"Aston Villa","country":"Argentina","overall":85,"pace":21,"shooting":54,"passing":50,"dribbling":66,"defending":63,"physical":91,"stamina":84,"tier":"Strong","basePrice":9,"retired":false},{"id":45,"name":"Enzo Fernandez","position":"CM","club":"Chelsea","country":"Argentina","overall":85,"pace":26,"shooting":72,"passing":74,"dribbling":91,"defending":82,"physical":61,"stamina":79,"tier":"Strong","basePrice":9,"retired":false},{"id":46,"name":"Alexis Mac Allister","position":"CM","club":"Liverpool","country":"Argentina","overall":85,"pace":24,"shooting":70,"passing":77,"dribbling":89,"defending":86,"physical":65,"stamina":80,"tier":"Strong","basePrice":9,"retired":false},{"id":47,"name":"Dominik Szoboszlai","position":"CM","club":"Liverpool","country":"Hungary","overall":84,"pace":27,"shooting":89,"passing":78,"dribbling":83,"defending":81,"physical":63,"stamina":91,"tier":"Strong","basePrice":9,"retired":false},{"id":48,"name":"Nicolo Barella","position":"CM","club":"Inter","country":"Italy","overall":85,"pace":24,"shooting":85,"passing":76,"dribbling":88,"defending":87,"physical":70,"stamina":86,"tier":"Strong","basePrice":9,"retired":false},{"id":49,"name":"Aurelien Tchouameni","position":"CDM","club":"Real Madrid","country":"France","overall":84,"pace":23,"shooting":74,"passing":67,"dribbling":81,"defending":72,"physical":88,"stamina":88,"tier":"Strong","basePrice":9,"retired":false},{"id":50,"name":"Eduardo Camavinga","position":"CM","club":"Real Madrid","country":"France","overall":85,"pace":25,"shooting":86,"passing":65,"dribbling":86,"defending":82,"physical":83,"stamina":91,"tier":"Strong","basePrice":9,"retired":false},{"id":51,"name":"Gavi","position":"CM","club":"Barcelona","country":"Spain","overall":84,"pace":24,"shooting":72,"passing":65,"dribbling":87,"defending":84,"physical":74,"stamina":87,"tier":"Strong","basePrice":9,"retired":false},{"id":52,"name":"Frenkie de Jong","position":"CM","club":"Barcelona","country":"Netherlands","overall":86,"pace":24,"shooting":81,"passing":69,"dribbling":93,"defending":91,"physical":62,"stamina":78,"tier":"Strong","basePrice":9,"retired":false},{"id":53,"name":"Mikel Merino","position":"CM","club":"Arsenal","country":"Spain","overall":83,"pace":21,"shooting":65,"passing":75,"dribbling":84,"defending":78,"physical":72,"stamina":85,"tier":"Average","basePrice":9,"retired":false},{"id":54,"name":"Martin Zubimendi","position":"CDM","club":"Real Sociedad","country":"Spain","overall":84,"pace":22,"shooting":62,"passing":63,"dribbling":88,"defending":80,"physical":83,"stamina":78,"tier":"Strong","basePrice":9,"retired":false},{"id":55,"name":"Gabriel Martinelli","position":"LW","club":"Arsenal","country":"Brazil","overall":84,"pace":26,"shooting":94,"passing":80,"dribbling":75,"defending":89,"physical":48,"stamina":84,"tier":"Strong","basePrice":9,"retired":false},{"id":56,"name":"Luis Diaz","position":"LW","club":"Liverpool","country":"Colombia","overall":85,"pace":27,"shooting":93,"passing":82,"dribbling":78,"defending":90,"physical":46,"stamina":83,"tier":"Strong","basePrice":9,"retired":false},{"id":57,"name":"Diogo Jota","position":"ST","club":"Liverpool","country":"Portugal","overall":84,"pace":25,"shooting":83,"passing":88,"dribbling":76,"defending":82,"physical":50,"stamina":82,"tier":"Strong","basePrice":9,"retired":false},{"id":58,"name":"Darwin Nunez","position":"ST","club":"Liverpool","country":"Uruguay","overall":83,"pace":27,"shooting":95,"passing":83,"dribbling":68,"defending":78,"physical":56,"stamina":94,"tier":"Average","basePrice":9,"retired":false},{"id":59,"name":"Julian Alvarez","position":"ST","club":"Atletico Madrid","country":"Argentina","overall":86,"pace":26,"shooting":89,"passing":88,"dribbling":82,"defending":88,"physical":52,"stamina":87,"tier":"Strong","basePrice":9,"retired":false},{"id":60,"name":"Alexander Isak","position":"ST","club":"Newcastle","country":"Sweden","overall":85,"pace":25,"shooting":94,"passing":89,"dribbling":76,"defending":88,"physical":45,"stamina":86,"tier":"Strong","basePrice":9,"retired":false},{"id":61,"name":"Cole Palmer","position":"AM","club":"Chelsea","country":"England","overall":87,"pace":27,"shooting":82,"passing":91,"dribbling":93,"defending":92,"physical":42,"stamina":77,"tier":"Strong","basePrice":10,"retired":false},{"id":62,"name":"Christopher Nkunku","position":"AM","club":"Chelsea","country":"France","overall":83,"pace":20,"shooting":86,"passing":84,"dribbling":78,"defending":86,"physical":48,"stamina":74,"tier":"Average","basePrice":9,"retired":false},{"id":63,"name":"Rasmus Hojlund","position":"ST","club":"Manchester United","country":"Denmark","overall":82,"pace":17,"shooting":91,"passing":78,"dribbling":62,"defending":75,"physical":54,"stamina":91,"tier":"Average","basePrice":9,"retired":false},{"id":64,"name":"Eberechi Eze","position":"AM","club":"Crystal Palace","country":"England","overall":82,"pace":16,"shooting":88,"passing":79,"dribbling":82,"defending":89,"physical":45,"stamina":77,"tier":"Average","basePrice":9,"retired":false},{"id":65,"name":"James Maddison","position":"AM","club":"Tottenham","country":"England","overall":83,"pace":18,"shooting":68,"passing":82,"dribbling":89,"defending":86,"physical":42,"stamina":71,"tier":"Average","basePrice":9,"retired":false},{"id":66,"name":"Jack Grealish","position":"LW","club":"Manchester City","country":"England","overall":82,"pace":18,"shooting":82,"passing":73,"dribbling":88,"defending":91,"physical":39,"stamina":72,"tier":"Average","basePrice":9,"retired":false},{"id":67,"name":"Moussa Diaby","position":"RW","club":"Al-Ittihad","country":"France","overall":80,"pace":15,"shooting":96,"passing":74,"dribbling":75,"defending":87,"physical":42,"stamina":85,"tier":"Average","basePrice":9,"retired":false},{"id":68,"name":"Riyad Mahrez","position":"RW","club":"Al-Ahli","country":"Algeria","overall":84,"pace":12,"shooting":81,"passing":84,"dribbling":88,"defending":92,"physical":39,"stamina":69,"tier":"Strong","basePrice":9,"retired":false},{"id":69,"name":"Sadio Mane","position":"LW","club":"Al-Nassr","country":"Senegal","overall":83,"pace":13,"shooting":88,"passing":84,"dribbling":78,"defending":86,"physical":49,"stamina":86,"tier":"Average","basePrice":9,"retired":false},{"id":70,"name":"Karim Benzema","position":"ST","club":"Al-Ittihad","country":"France","overall":85,"pace":11,"shooting":74,"passing":93,"dribbling":89,"defending":88,"physical":42,"stamina":76,"tier":"Strong","basePrice":9,"retired":false},{"id":71,"name":"Neymar Jr","position":"LW","club":"Santos","country":"Brazil","overall":86,"pace":10,"shooting":84,"passing":86,"dribbling":93,"defending":96,"physical":38,"stamina":67,"tier":"Strong","basePrice":9,"retired":false},{"id":72,"name":"Lionel Messi","position":"RW","club":"Inter Miami","country":"Argentina","overall":92,"pace":9,"shooting":82,"passing":96,"dribbling":98,"defending":97,"physical":35,"stamina":66,"tier":"Elite","basePrice":10,"retired":false},{"id":73,"name":"Cristiano Ronaldo","position":"ST","club":"Al-Nassr","country":"Portugal","overall":90,"pace":8,"shooting":78,"passing":96,"dribbling":84,"defending":91,"physical":45,"stamina":82,"tier":"Elite","basePrice":10,"retired":false},{"id":74,"name":"Zinedine Zidane","position":"AM","club":"Retired","country":"France","overall":96,"pace":0,"shooting":84,"passing":92,"dribbling":98,"defending":97,"physical":55,"stamina":83,"tier":"Legend","basePrice":11,"retired":true},{"id":75,"name":"Ronaldinho","position":"LW","club":"Retired","country":"Brazil","overall":95,"pace":0,"shooting":92,"passing":91,"dribbling":95,"defending":99,"physical":42,"stamina":79,"tier":"Legend","basePrice":10,"retired":true},{"id":76,"name":"Ronaldo Nazario","position":"ST","club":"Retired","country":"Brazil","overall":96,"pace":0,"shooting":97,"passing":98,"dribbling":90,"defending":96,"physical":45,"stamina":92,"tier":"Legend","basePrice":11,"retired":true},{"id":77,"name":"Thierry Henry","position":"ST","club":"Retired","country":"France","overall":95,"pace":0,"shooting":97,"passing":95,"dribbling":91,"defending":94,"physical":53,"stamina":88,"tier":"Legend","basePrice":10,"retired":true},{"id":78,"name":"Xavi","position":"CM","club":"Retired","country":"Spain","overall":94,"pace":0,"shooting":73,"passing":81,"dribbling":99,"defending":97,"physical":51,"stamina":73,"tier":"Legend","basePrice":10,"retired":true},{"id":79,"name":"Andres Iniesta","position":"CM","club":"Retired","country":"Spain","overall":94,"pace":0,"shooting":76,"passing":83,"dribbling":99,"defending":98,"physical":45,"stamina":72,"tier":"Legend","basePrice":10,"retired":true},{"id":80,"name":"Andrea Pirlo","position":"CM","club":"Retired","country":"Italy","overall":93,"pace":0,"shooting":66,"passing":78,"dribbling":99,"defending":91,"physical":47,"stamina":61,"tier":"Legend","basePrice":10,"retired":true},{"id":81,"name":"Paolo Maldini","position":"CB","club":"Retired","country":"Italy","overall":95,"pace":0,"shooting":78,"passing":60,"dribbling":83,"defending":82,"physical":99,"stamina":87,"tier":"Legend","basePrice":10,"retired":true},{"id":82,"name":"Franco Baresi","position":"CB","club":"Retired","country":"Italy","overall":94,"pace":0,"shooting":72,"passing":54,"dribbling":86,"defending":84,"physical":99,"stamina":82,"tier":"Legend","basePrice":10,"retired":true},{"id":83,"name":"Gianluigi Buffon","position":"GK","club":"Retired","country":"Italy","overall":94,"pace":0,"shooting":45,"passing":42,"dribbling":62,"defending":59,"physical":99,"stamina":84,"tier":"Legend","basePrice":10,"retired":true},{"id":84,"name":"Iker Casillas","position":"GK","club":"Retired","country":"Spain","overall":93,"pace":0,"shooting":52,"passing":43,"dribbling":61,"defending":64,"physical":98,"stamina":80,"tier":"Legend","basePrice":10,"retired":true},{"id":85,"name":"Manuel Neuer","position":"GK","club":"Bayern Munich","country":"Germany","overall":88,"pace":9,"shooting":54,"passing":48,"dribbling":74,"defending":75,"physical":92,"stamina":81,"tier":"Elite","basePrice":10,"retired":false},{"id":86,"name":"Didier Drogba","position":"ST","club":"Retired","country":"Ivory Coast","overall":94,"pace":0,"shooting":80,"passing":96,"dribbling":78,"defending":85,"physical":55,"stamina":96,"tier":"Legend","basePrice":10,"retired":true},{"id":87,"name":"Samuel Eto'o","position":"ST","club":"Retired","country":"Cameroon","overall":94,"pace":0,"shooting":96,"passing":94,"dribbling":82,"defending":91,"physical":48,"stamina":90,"tier":"Legend","basePrice":10,"retired":true},{"id":88,"name":"Kaka","position":"AM","club":"Retired","country":"Brazil","overall":93,"pace":0,"shooting":95,"passing":91,"dribbling":94,"defending":95,"physical":43,"stamina":86,"tier":"Legend","basePrice":10,"retired":true},{"id":89,"name":"Steven Gerrard","position":"CM","club":"Retired","country":"England","overall":92,"pace":0,"shooting":86,"passing":87,"dribbling":91,"defending":88,"physical":71,"stamina":91,"tier":"Legend","basePrice":10,"retired":true},{"id":90,"name":"Frank Lampard","position":"CM","club":"Retired","country":"England","overall":91,"pace":0,"shooting":74,"passing":91,"dribbling":90,"defending":86,"physical":55,"stamina":82,"tier":"Legend","basePrice":10,"retired":true},{"id":91,"name":"David Beckham","position":"RM","club":"Retired","country":"England","overall":90,"pace":0,"shooting":76,"passing":79,"dribbling":96,"defending":88,"physical":48,"stamina":78,"tier":"Legend","basePrice":10,"retired":true},{"id":92,"name":"Arjen Robben","position":"RW","club":"Retired","country":"Netherlands","overall":92,"pace":0,"shooting":95,"passing":91,"dribbling":91,"defending":96,"physical":42,"stamina":78,"tier":"Legend","basePrice":10,"retired":true},{"id":93,"name":"Zlatan Ibrahimovic","position":"ST","club":"Retired","country":"Sweden","overall":93,"pace":0,"shooting":74,"passing":97,"dribbling":88,"defending":87,"physical":49,"stamina":91,"tier":"Legend","basePrice":10,"retired":true},{"id":94,"name":"Luis Figo","position":"RW","club":"Retired","country":"Portugal","overall":92,"pace":0,"shooting":88,"passing":87,"dribbling":94,"defending":95,"physical":44,"stamina":79,"tier":"Legend","basePrice":10,"retired":true},{"id":95,"name":"Fabio Cannavaro","position":"CB","club":"Retired","country":"Italy","overall":92,"pace":0,"shooting":84,"passing":53,"dribbling":78,"defending":79,"physical":99,"stamina":91,"tier":"Legend","basePrice":10,"retired":true},{"id":96,"name":"Cafu","position":"RB","club":"Retired","country":"Brazil","overall":92,"pace":0,"shooting":96,"passing":61,"dribbling":86,"defending":89,"physical":87,"stamina":93,"tier":"Legend","basePrice":10,"retired":true},{"id":97,"name":"Roberto Carlos","position":"LB","club":"Retired","country":"Brazil","overall":92,"pace":0,"shooting":98,"passing":75,"dribbling":86,"defending":91,"physical":82,"stamina":95,"tier":"Legend","basePrice":10,"retired":true},{"id":98,"name":"Clarence Seedorf","position":"CM","club":"Retired","country":"Netherlands","overall":91,"pace":0,"shooting":82,"passing":78,"dribbling":92,"defending":85,"physical":67,"stamina":89,"tier":"Legend","basePrice":10,"retired":true},{"id":99,"name":"Patrick Vieira","position":"CDM","club":"Retired","country":"France","overall":91,"pace":0,"shooting":78,"passing":74,"dribbling":88,"defending":78,"physical":88,"stamina":91,"tier":"Legend","basePrice":10,"retired":true},{"id":100,"name":"Eric Cantona","position":"ST","club":"Retired","country":"France","overall":91,"pace":0,"shooting":76,"passing":92,"dribbling":91,"defending":89,"physical":58,"stamina":80,"tier":"Legend","basePrice":10,"retired":true},{"id":101,"name":"George Best","position":"RW","club":"Retired","country":"Northern Ireland","overall":94,"pace":0,"shooting":95,"passing":90,"dribbling":94,"defending":98,"physical":35,"stamina":74,"tier":"Legend","basePrice":10,"retired":true},{"id":102,"name":"Johan Cruyff","position":"ST","club":"Retired","country":"Netherlands","overall":97,"pace":0,"shooting":94,"passing":96,"dribbling":99,"defending":99,"physical":44,"stamina":80,"tier":"Legend","basePrice":11,"retired":true},{"id":103,"name":"Diego Maradona","position":"AM","club":"Retired","country":"Argentina","overall":97,"pace":0,"shooting":91,"passing":94,"dribbling":99,"defending":99,"physical":39,"stamina":74,"tier":"Legend","basePrice":11,"retired":true},{"id":104,"name":"Pele","position":"ST","club":"Retired","country":"Brazil","overall":98,"pace":0,"shooting":93,"passing":99,"dribbling":98,"defending":99,"physical":48,"stamina":88,"tier":"Legend","basePrice":11,"retired":true}];

// Expanded roster: famous and less-famous players from many leagues.
// The generated attributes are deterministic and intentionally include many Average/Weak players.
function rosterHash(text){
  let h=2166136261;
  for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}
  return h>>>0;
}
function makeDiversePlayer(id,name,position,club,country,overall,tier){
  const h=rosterHash(name+"|"+club+"|"+id);
  const jitter=(n)=>((h>>>n)%9)-4;
  const base=overall;
  const role={
    GK:{shoot:-24,pass:-8,drib:-6,def:8,phy:8,pace:-20},
    RB:{shoot:-8,pass:2,drib:0,def:8,phy:2,pace:7},
    LB:{shoot:-8,pass:2,drib:0,def:8,phy:2,pace:7},
    CB:{shoot:-18,pass:-2,drib:-8,def:14,phy:10,pace:-2},
    CDM:{shoot:-8,pass:8,drib:2,def:10,phy:6,pace:-2},
    CM:{shoot:0,pass:10,drib:7,def:3,phy:0,pace:1},
    AM:{shoot:8,pass:12,drib:10,def:-7,phy:-3,pace:3},
    LW:{shoot:10,pass:6,drib:12,def:-12,phy:-5,pace:12},
    RW:{shoot:10,pass:6,drib:12,def:-12,phy:-5,pace:12},
    ST:{shoot:14,pass:2,drib:5,def:-15,phy:5,pace:7}
  }[position]||{};
  const v=(offset,shift)=>Math.max(35,Math.min(99,Math.round(base+offset+jitter(shift))));
  return {
    id,name,position,club,country,overall,
    pace:v(role.pace||0,0),
    shooting:v(role.shoot||0,3),
    passing:v(role.pass||0,6),
    dribbling:v(role.drib||0,9),
    defending:v(role.def||0,12),
    physical:v(role.phy||0,15),
    stamina:v(2,18),
    tier,
    basePrice:tier==="Weak"?4:tier==="Average"?6:tier==="Strong"?8:tier==="Elite"?10:11,
    retired:false
  };
}
const diverseRoster=[
["Matz Sels","GK","Nottingham Forest","Belgium",82,"Strong"],["Giorgi Mamardashvili","GK","Valencia","Georgia",83,"Strong"],["Yassine Bounou","GK","Al Hilal","Morocco",82,"Strong"],["Wojciech Szczesny","GK","Barcelona","Poland",82,"Strong"],["Lukasz Skorupski","GK","Bologna","Poland",79,"Average"],["Kevin Trapp","GK","Eintracht Frankfurt","Germany",78,"Average"],["Alban Lafont","GK","Nantes","France",75,"Average"],["Kasper Schmeichel","GK","Celtic","Denmark",75,"Average"],["Mostafa Shobeir","GK","Al Ahly","Egypt",72,"Weak"],["Mohamed El Shenawy","GK","Al Ahly","Egypt",78,"Average"],
["Denzel Dumfries","RB","Inter","Netherlands",83,"Strong"],["Pedro Porro","RB","Tottenham","Spain",82,"Strong"],["Jeremie Frimpong","RB","Bayer Leverkusen","Netherlands",84,"Strong"],["Reece James","RB","Chelsea","England",80,"Strong"],["Noussair Mazraoui","RB","Manchester United","Morocco",79,"Average"],["Emerson Royal","RB","AC Milan","Brazil",76,"Average"],["Omar Elabdellaoui","RB","Sarpsborg","Norway",72,"Weak"],["Omar Kharbin","RB","Al Wahda","Syria",69,"Weak"],
["Piero Hincapie","CB","Bayer Leverkusen","Ecuador",82,"Strong"],["Jarrad Branthwaite","CB","Everton","England",80,"Strong"],["Goncalo Inacio","CB","Sporting","Portugal",81,"Strong"],["Micky van de Ven","CB","Tottenham","Netherlands",84,"Strong"],["Edmond Tapsoba","CB","Bayer Leverkusen","Burkina Faso",80,"Strong"],["Nayef Aguerd","CB","West Ham","Morocco",78,"Average"],["Ahmed Hegazy","CB","Neom","Egypt",75,"Average"],["Ramy Rabia","CB","Al Ain","Egypt",72,"Weak"],["Mohamed Abdelmonem","CB","Nice","Egypt",78,"Average"],["Ali Maaloul","CB","Al Ahly","Tunisia",74,"Average"],
["Destiny Udogie","LB","Tottenham","Italy",80,"Strong"],["Milos Kerkez","LB","Liverpool","Hungary",79,"Average"],["Alejandro Grimaldo","LB","Bayer Leverkusen","Spain",84,"Strong"],["Ferland Mendy","LB","Real Madrid","France",80,"Strong"],["Pervis Estupinan","LB","Brighton","Ecuador",78,"Average"],["Ahmed Fattouh","LB","Zamalek","Egypt",73,"Weak"],["Yahia Attiat-Allah","LB","Al Ahly","Morocco",74,"Average"],
["Manuel Ugarte","CDM","Manchester United","Uruguay",81,"Strong"],["Joao Palhinha","CDM","Bayern Munich","Portugal",82,"Strong"],["Amadou Onana","CDM","Aston Villa","Belgium",80,"Strong"],["Ibrahim Sangare","CDM","Nottingham Forest","Ivory Coast",77,"Average"],["Mohamed Elneny","CDM","Al Jazira","Egypt",73,"Weak"],["Tarek Hamed","CDM","Damac","Egypt",71,"Weak"],
["Conor Gallagher","CM","Atletico Madrid","England",80,"Strong"],["Teun Koopmeiners","CM","Juventus","Netherlands",82,"Strong"],["Hakan Calhanoglu","CM","Inter","Turkey",84,"Strong"],["Lovro Majer","CM","Wolfsburg","Croatia",79,"Average"],["Yunus Musah","CM","AC Milan","United States",77,"Average"],["Imam Ashour","CM","Al Ahly","Egypt",76,"Average"],["Mohamed Magdy Afsha","CM","Al Ahly","Egypt",74,"Average"],["Nabil Emad Dunga","CM","Zamalek","Egypt",72,"Weak"],
["Takefusa Kubo","RW","Real Sociedad","Japan",82,"Strong"],["Raphinha","RW","Barcelona","Brazil",86,"Elite"],["Bryan Mbeumo","RW","Brentford","Cameroon",82,"Strong"],["Johan Bakayoko","RW","PSV","Belgium",78,"Average"],["Abdelrahman Ghareeb","RW","Al Nassr","Saudi Arabia",75,"Average"],["Hussein El Shahat","RW","Al Ahly","Egypt",74,"Average"],["Mahmoud Shikabala","RW","Zamalek","Egypt",72,"Weak"],
["Bradley Barcola","LW","PSG","France",83,"Strong"],["Jack Grealish","LW","Manchester City","England",80,"Strong"],["Cody Gakpo","LW","Liverpool","Netherlands",82,"Strong"],["Samuel Chukwueze","LW","AC Milan","Nigeria",77,"Average"],["Moussa Diaby","LW","Al Ittihad","France",79,"Average"],["Trezeguet","LW","Al Ahly","Egypt",77,"Average"],["Zizo","LW","Zamalek","Egypt",76,"Average"],["Karim Fouad","LW","Al Ahly","Egypt",71,"Weak"],
["Ollie Watkins","ST","Aston Villa","England",84,"Strong"],["Dusan Vlahovic","ST","Juventus","Serbia",83,"Strong"],["Viktor Gyokeres","ST","Arsenal","Sweden",85,"Strong"],["Lois Openda","ST","RB Leipzig","Belgium",82,"Strong"],["Santiago Gimenez","ST","AC Milan","Mexico",80,"Strong"],["Serhou Guirassy","ST","Borussia Dortmund","Guinea",82,"Strong"],["Folarin Balogun","ST","Monaco","United States",77,"Average"],["Marmoush","ST","Manchester City","Egypt",84,"Strong"],["Mostafa Mohamed","ST","Nantes","Egypt",75,"Average"],["Ahmed Refaat","ST","Modern Sport","Egypt",70,"Weak"],["Youssef En-Nesyri","ST","Fenerbahce","Morocco",80,"Strong"],["Abderrazak Hamdallah","ST","Al Shabab","Morocco",78,"Average"]
];
let nextDiverseId=players.reduce((m,p)=>Math.max(m,p.id),0)+1;
for(const row of diverseRoster){
  const [name,position,club,country,overall,tier]=row;
  players.push(makeDiversePlayer(nextDiverseId++,name,position,club,country,overall,tier));
}

const roundPositions=["GK","RB","CB","CB","LB","CDM","CM","CM","LW","RW","ST"];
const category={GK:"حراسة",RB:"دفاع",CB:"دفاع",LB:"دفاع",CDM:"وسط",CM:"وسط",LW:"هجوم",RW:"هجوم",ST:"هجوم"};
const aliases={"Kylian Mbappe":"Kylian Mbappé","Vinicius Junior":"Vinícius Júnior","Mohamed Salah":"Mohamed Salah","Pele":"Pelé","Kaka":"Kaká"};
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript",".css":"text/css",".json":"application/json",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".svg":"image/svg+xml"};
function roomCode(){let s="";do{s=Math.random().toString(36).slice(2,6).toUpperCase()}while(rooms.has(s));return s}
function publicState(r){const pos=(r.roundPositions||roundPositions)[r.round-1];return {phase:r.phase,round:r.round,totalRounds:r.totalRounds||11,bid:r.bid,highest:r.highest,turn:r.turn||null,endsAt:r.endsAt,current:r.current,bids:r.bids,roundPosition:pos,roundLabel:category[pos],mode:r.mode,players:Object.fromEntries([...r.players].map(([id,p])=>[id,{name:p.name,photo:p.photo||"",budget:p.budget,team:p.team}]))}}
function broadcast(r,msg){for(const c of r.clients)if(c.readyState===1)c.send(JSON.stringify(msg))}

function tierWeight(tier){
  return tier==="Legend"?0.12:tier==="Elite"?0.45:tier==="Strong"?0.95:tier==="Average"?1.55:1.85;
}
function pickForPosition(r,pos,avoidTier=null){
  const available=players.filter(p=>!r.used.has(p.id)&&p.position===pos);
  if(!available.length)return null;
  r.tierExposure=r.tierExposure||{Legend:0,Elite:0,Strong:0,Average:0,Weak:0};
  const weights=available.map(p=>{
    const exposure=r.tierExposure[p.tier]||0;
    const antiStreak=1/(1+exposure*0.32);
    const diversity=avoidTier&&p.tier===avoidTier?0.45:1;
    return tierWeight(p.tier)*antiStreak*diversity;
  });
  const total=weights.reduce((a,b)=>a+b,0);
  let x=Math.random()*total;
  for(let i=0;i<available.length;i++){
    x-=weights[i];
    if(x<=0){
      const picked=available[i];
      r.tierExposure[picked.tier]=(r.tierExposure[picked.tier]||0)+1;
      return picked;
    }
  }
  const picked=available[available.length-1];
  r.tierExposure[picked.tier]=(r.tierExposure[picked.tier]||0)+1;
  return picked;
}
function startRound(r){
  const pos=(r.roundPositions||roundPositions)[r.round-1];
  const p=pickForPosition(r,pos);
  if(!p){finishGame(r);return}
  r.used.add(p.id);r.current=p;r.bid=1;r.highest=null;r.bids=[];
  r.endsAt=Date.now()+20000;r.skipUsed=new Set();
  const ids=[...r.players.keys()].filter(x=>(r.players.get(x)?.budget||0)>=1);
  if(!ids.length){finishRound(r);return}
  r.turn=ids[Math.floor(Math.random()*ids.length)];
  broadcast(r,{type:"state",state:publicState(r)});
  clearTimeout(r.timer);r.timer=setTimeout(()=>finishRound(r),20100);
}
function finishRound(r){
  if(r.phase!=="auction")return;
  clearTimeout(r.timer);
  let winnerId=r.highest;
  if(!winnerId){
    const ids=[...r.players.keys()];
    winnerId=ids[Math.floor(Math.random()*ids.length)];
  }
  const winner=r.players.get(winnerId);
  const loserId=[...r.players.keys()].find(x=>x!==winnerId);
  let replacement=null;
  if(winner&&winner.budget>=r.bid){
    winner.budget-=r.bid;
    winner.team.push(r.current.id);
    if(loserId){
      replacement=pickForPosition(r,r.current.position,r.current.tier);
      if(!replacement){
        const fallback=players.filter(p=>!r.used.has(p.id)&&p.position===r.current.position)[0]
          ||players.filter(p=>!r.used.has(p.id)).sort((a,b)=>a.overall-b.overall)[0];
        replacement=fallback||null;
      }
      if(replacement){
        r.used.add(replacement.id);
        r.players.get(loserId).team.push(replacement.id);
      }
    }
  }
  const loser=loserId?r.players.get(loserId):null;
  const summary={
    winnerId:winnerId||null,loserId:loserId||null,player:r.current,
    replacement:replacement?{player:replacement,reason:"skip"}:null,
    price:winner?r.bid:0,winnerName:winner?.name||"—",loserName:loser?.name||"—"
  };
  broadcast(r,{type:"roundEnd",...summary});
  r.round++;
  if(r.round>(r.totalRounds||11)){
    setTimeout(()=>{broadcast(r,{type:"matchPreparing",seconds:4});setTimeout(()=>finishGame(r),4000)},4000);
    return;
  }
  setTimeout(()=>startRound(r),4000);
}
function avg(arr,fn){return arr.length?arr.reduce((sum,x)=>sum+fn(x),0)/arr.length:55}
function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
function teamModel(team){
  const arr=team.team.map(id=>players.find(p=>p.id===id)).filter(Boolean);
  const group=positions=>arr.filter(p=>positions.includes(p.position));
  const gks=group(["GK"]), defs=group(["RB","CB","LB"]), mids=group(["CDM","CM","AM"]), attackers=group(["LW","RW","ST","AM"]);
  const gk=avg(gks,p=>p.overall);
  const defense=avg(defs,p=>p.defending*0.65+p.overall*0.35);
  const midfield=avg(mids,p=>p.passing*0.45+p.dribbling*0.20+p.defending*0.15+p.overall*0.20);
  const attack=avg(attackers,p=>p.shooting*0.50+p.dribbling*0.20+p.pace*0.15+p.overall*0.15);
  const finishing=avg(attackers,p=>p.shooting);
  const passing=avg(arr,p=>p.passing);
  const stamina=avg(arr,p=>p.stamina);
  const overall=avg(arr,p=>p.overall);
  const counts={GK:gks.length,DEF:defs.length,MID:mids.length,ATT:attackers.length};
  let balance=0;
  if(counts.GK>=1)balance+=1;
  if(counts.DEF>=2)balance+=1;
  if(counts.MID>=2)balance+=1;
  if(counts.ATT>=2)balance+=1;
  balance/=4;
  const chemistry=clamp(
    65 + balance*20 + Math.min(8,stamina/12) - Math.max(0,arr.length-11)*2,
    55,95
  );
  const strength=attack*0.30+midfield*0.25+defense*0.18+gk*0.12+overall*0.10+chemistry*0.05;
  return {arr,gk,defense,midfield,attack,finishing,passing,stamina,overall,balance,chemistry,strength,counts};
}
function chooseScorer(arr,seed=0){
  const pool=arr.filter(p=>["ST","LW","RW","AM","CM"].includes(p.position));
  const ranked=(pool.length?pool:arr).map(p=>({p,score:p.shooting*0.58+p.overall*0.24+p.dribbling*0.10+p.pace*0.08}))
    .sort((a,b)=>b.score-a.score);
  if(!ranked.length)return null;
  return ranked[Math.min(seed,ranked.length-1)].p;
}
function goalsFromModel(xg,finishing,oppResistance){
  const conversion=0.84+(finishing-65)*0.008-(oppResistance-70)*0.0025;
  const raw=clamp(xg*conversion,0,5.4);
  let goals=Math.floor(raw);
  const fraction=raw-goals;
  const threshold=clamp(0.32+(finishing-70)*0.009-(oppResistance-70)*0.004,0.18,0.72);
  if(fraction>=threshold)goals++;
  return clamp(goals,0,5);
}
function finishGame(r){
  r.phase="done";clearTimeout(r.timer);
  const ps=[...r.players.values()];
  if(ps.length!==2)return;
  const a=teamModel(ps[0]),b=teamModel(ps[1]);
  const resistanceA=b.defense*0.58+b.gk*0.42;
  const resistanceB=a.defense*0.58+a.gk*0.42;
  // Deterministic AI judge: no random number and no hidden coin-flip.
  const attackEdgeA=(a.attack-resistanceA)*0.055;
  const attackEdgeB=(b.attack-resistanceB)*0.055;
  const midfieldEdgeA=(a.midfield-b.midfield)*0.018;
  const midfieldEdgeB=(b.midfield-a.midfield)*0.018;
  const balanceEdgeA=(a.balance-b.balance)*0.34;
  const balanceEdgeB=(b.balance-a.balance)*0.34;
  const chemistryEdgeA=(a.chemistry-b.chemistry)*0.012;
  const chemistryEdgeB=(b.chemistry-a.chemistry)*0.012;
  const xgA=clamp(1.10+attackEdgeA+midfieldEdgeA+balanceEdgeA+chemistryEdgeA,0.10,4.20);
  const xgB=clamp(1.10+attackEdgeB+midfieldEdgeB+balanceEdgeB+chemistryEdgeB,0.10,4.20);
  const ga=goalsFromModel(xgA,a.finishing,resistanceA);
  const gb=goalsFromModel(xgB,b.finishing,resistanceB);
  const events=[];
  function addGoals(model,teamIndex,total){
    for(let i=0;i<total;i++){
      const minute=clamp(Math.round(11+i*23+(100-model.midfield)*0.10+(100-model.stamina)*0.05+teamIndex*4),2,89);
      const scorer=chooseScorer(model.arr,i);
      const assistCandidates=model.arr.filter(p=>scorer&&p.id!==scorer.id&&["CM","CDM","AM","LW","RW","ST"].includes(p.position));
      const assist=assistCandidates.length?chooseScorer(assistCandidates,i+1):null;
      if(scorer)events.push({minute,team:teamIndex,scorer:scorer.name,assist:assist?.name||null});
    }
  }
  addGoals(a,0,ga);addGoals(b,1,gb);
  events.sort((x,y)=>x.minute-y.minute||x.team-y.team);
  const possessionA=Math.round(clamp(50+(a.midfield-b.midfield)*0.45+(a.passing-b.passing)*0.10+(a.chemistry-b.chemistry)*0.08,35,65));
  const possessionB=100-possessionA;
  const log=[
    `1' — 🏟️ انطلاق المباراة`,
    `12' — 🧠 استحواذ ${ps[0].name}: ${possessionA}% مقابل ${possessionB}%`,
    `24' — ⚡ صراع في وسط الملعب والضغط يتحدد حسب جودة التمرير والدفاع`,
    `38' — 🧤 الحارس يتدخل وفق تقييم الحراسة وجودة الهجوم`,
    `45+1' — ⏱️ نهاية الشوط الأول`,
    `57' — 🔥 ارتفاع نسق المباراة حسب اللياقة والاستحواذ`,
    `68' — 🧠 نموذج التحليل يقيّم التوازن بين الخطوط`,
    `79' — 🎯 فرصة كبيرة تتحدد من جودة الهجوم أمام مقاومة الخصم`,
    `90+3' — 🏁 صافرة النهاية`
  ];
  const goalLines=events.map(e=>`${e.minute}' — ⚽ ${e.scorer} (${e.team===0?ps[0].name:ps[1].name})${e.assist?` — صناعة ${e.assist}`:""}`);
  const fullLog=[...log.slice(0,4),...goalLines,...log.slice(4)];
  fullLog.push(`🤖 حكم الذكاء الاصطناعي: قوة ${ps[0].name} ${a.strength.toFixed(1)} مقابل ${ps[1].name} ${b.strength.toFixed(1)}.`);
  fullLog.push(`🧠 النتيجة حتمية لنفس التشكيلتين: لا يوجد Math.random داخل محرك نتيجة المباراة.`);
  fullLog.push(`📊 تحليل ${ps[0].name}: هجوم ${a.attack.toFixed(1)} | وسط ${a.midfield.toFixed(1)} | دفاع ${a.defense.toFixed(1)} | حراسة ${a.gk.toFixed(1)} | توازن ${(a.balance*100).toFixed(0)}%.`);
  fullLog.push(`📊 تحليل ${ps[1].name}: هجوم ${b.attack.toFixed(1)} | وسط ${b.midfield.toFixed(1)} | دفاع ${b.defense.toFixed(1)} | حراسة ${b.gk.toFixed(1)} | توازن ${(b.balance*100).toFixed(0)}%.`);
  fullLog.push(`🎯 xG المحسوب: ${xgA.toFixed(2)} مقابل ${xgB.toFixed(2)}.`);
  fullLog.push(`⚽ النتيجة خرجت من xG + جودة الإنهاء + مقاومة الدفاع والحارس + الوسط + التوازن + الانسجام.`);
  fullLog.push(`📈 الاستحواذ المتوقع: ${possessionA}% مقابل ${possessionB}%.`);
  const [paPlayer,pbPlayer]=ps;
  const pa=touchProfile(paPlayer),pb=touchProfile(pbPlayer);
  pa.matches++;pb.matches++;
  if(ga>gb){pa.wins++;pb.losses++;pa.points+=3}
  else if(gb>ga){pb.wins++;pa.losses++;pb.points+=3}
  else{pa.draws++;pb.draws++;pa.points++;pb.points++}
  saveProfiles();
  broadcast(r,{type:"leaderboard",players:leaderboard()});
  broadcast(r,{type:"result",result:{
    score:`${ps[0].name} ${ga} — ${gb} ${ps[1].name}`,
    log:fullLog,goals:events,teams:{a:ps[0],b:ps[1]},
    ai:{strengthA:a.strength,strengthB:b.strength,xgA,xgB,possessionA,possessionB,
      analysisA:a,analysisB:b,deterministic:true}
  }});
}
function photoFor(id){const p=players.find(x=>x.id===Number(id));if(!p)return null;const name=aliases[p.name]||p.name;return `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.replaceAll(" ","_"))}`}
function sendPhoto(res,id){const p=players.find(x=>x.id===Number(id));if(!p){res.writeHead(404);return res.end()}if(photoCache.has(p.id)){res.writeHead(302,{Location:photoCache.get(p.id)});return res.end()}https.get(photoFor(p.id),{headers:{"User-Agent":"YousefGames/1.0"}},r=>{let data="";r.on("data",c=>data+=c);r.on("end",()=>{try{const j=JSON.parse(data),src=j?.thumbnail?.source||j?.originalimage?.source;if(src){photoCache.set(p.id,src);res.writeHead(302,{Location:src,"Cache-Control":"public,max-age=86400"});return res.end()}}catch(e){}res.writeHead(404);res.end()})}).on("error",()=>{res.writeHead(404);res.end()})}
const server=http.createServer((req,res)=>{let u=req.url.split("?")[0];if(u.startsWith("/player-photo/"))return sendPhoto(res,u.split("/").pop());if(u==="/")u="/index.html";const f=path.join(__dirname,u);if(!f.startsWith(__dirname)||!fs.existsSync(f)){res.writeHead(404);return res.end("Not found")}const ext=path.extname(f);res.writeHead(200,{"Content-Type":mime[ext]||"application/octet-stream"});fs.createReadStream(f).pipe(res)});
const wss=new WebSocket.Server({server});
wss.on("connection",ws=>{
  let room=null,id=Math.random().toString(36).slice(2,10);
  ws.send(JSON.stringify({type:"publicRooms",rooms:publicRooms()}));
  ws.on("message",raw=>{
    let m;try{m=JSON.parse(raw)}catch{return}
    if(m.type==="browse"){
      ws.send(JSON.stringify({type:"publicRooms",rooms:publicRooms()}));
    }else if(m.type==="create"){
      room=roomCode();
      const teamSize=Number(m.teamSize)===5?5:11;
      const budget=teamSize===5?100:200;
      const positions=teamSize===5?["GK","CB","CM","RW","ST"]:roundPositions;
      const r={phase:"lobby",round:0,players:new Map(),clients:new Set(),used:new Set(),current:null,bid:0,highest:null,bids:[],endsAt:0,timer:null,skipUsed:new Set(),turn:null,replayRequester:null,tierExposure:{Legend:0,Elite:0,Strong:0,Average:0,Weak:0},teamSize,startBudget:budget,totalRounds:teamSize,roundPositions:positions,mode:teamSize===5?"خماسية":"11 لاعب"};
      rooms.set(room,r);
      const p={name:String(m.name||"لاعب").slice(0,30),photo:String(m.photo||""),profileId:String(m.profileId||m.name||"لاعب"),budget,team:[]};
      r.players.set(id,p);touchProfile(p);saveProfiles();r.clients.add(ws);
      ws.send(JSON.stringify({type:"connected",me:id,room,host:true}));broadcast(r,{type:"state",state:publicState(r)});broadcastRooms();
    }else if(m.type==="join"){
      room=String(m.room||"").toUpperCase();const r=rooms.get(room);
      if(!r||r.phase!=="lobby")return ws.send(JSON.stringify({type:"error",message:"الغرفة غير موجودة أو بدأت بالفعل"}));
      if(r.players.size>=2)return ws.send(JSON.stringify({type:"error",message:"الغرفة ممتلئة — لاعبان فقط"}));
      const p={name:String(m.name||"لاعب").slice(0,30),photo:String(m.photo||""),profileId:String(m.profileId||m.name||"لاعب"),budget:r.startBudget,team:[]};
      r.players.set(id,p);touchProfile(p);saveProfiles();r.clients.add(ws);ws.send(JSON.stringify({type:"connected",me:id,room,host:false}));broadcast(r,{type:"state",state:publicState(r)});broadcastRooms();
    }else if(m.type==="getLeaderboard"){ws.send(JSON.stringify({type:"leaderboard",players:leaderboard()}));
    }else if(m.type==="getProfile"){const k=String(m.profileId||m.name||"لاعب");const p=profiles[k]||{name:String(m.name||"لاعب"),matches:0,wins:0,losses:0,draws:0,points:0};const rank=Math.max(1,leaderboard().findIndex(x=>x.id===k)+1);ws.send(JSON.stringify({type:"profile",profile:{...p,rank}}));
    }else if(room){
      const r=rooms.get(room);if(!r)return;

      if(m.type==="start"&&[...r.players.keys()][0]===id&&r.players.size===2&&r.phase==="lobby"){
        r.phase="auction";r.round=1;broadcastRooms();startRound(r);
      }

      if(m.type==="bid"&&r.phase==="auction"){
        const p=r.players.get(id),amount=Math.max(1,Math.floor(Number(m.amount)||1));
        if(id!==r.turn)return ws.send(JSON.stringify({type:"error",message:"مش دورك في المزايدة الآن"}));
        const amt=amount;
        if(p&&p.budget>=amt&&amt>r.bid){
          r.bid=amt;r.highest=id;r.bids.push({name:p.name,amount:amt});
          const ids=[...r.players.keys()].filter(x=>x!==id&&(r.players.get(x)?.budget||0)>=1);r.turn=ids[0]||id;
          r.endsAt=Date.now()+20000;clearTimeout(r.timer);r.timer=setTimeout(()=>finishRound(r),20100);
          broadcast(r,{type:"state",state:publicState(r)});
        }
      }

      if(m.type==="skip"&&r.phase==="auction"){
        if(id!==r.turn)return ws.send(JSON.stringify({type:"error",message:"مش دورك في المزايدة الآن"}));
        if(!r.highest||r.highest===id)return ws.send(JSON.stringify({type:"error",message:"لا يمكن التخطي قبل وجود مزايد آخر"}));
        r.skipUsed.add(id);finishRound(r);
      }

      if(m.type==="replayRequest"&&r.phase==="done"&&r.players.size===2){
        const first=[...r.players.keys()][0],other=[...r.players.keys()].find(x=>x!==first);
        if(id!==first)return ws.send(JSON.stringify({type:"error",message:"طلب مباراة أخرى متاح للاعب الأول فقط"}));
        if(r.replayRequester)return ws.send(JSON.stringify({type:"error",message:"تم إرسال طلب بالفعل، في انتظار موافقة اللاعب الآخر"}));
        r.replayRequester=id;
        broadcast(r,{type:"replayRequest",requesterId:id,requesterName:r.players.get(id)?.name||"اللاعب الأول",targetId:other,targetName:r.players.get(other)?.name||"اللاعب الآخر"});
      }

      if(m.type==="replayResponse"&&r.phase==="done"&&r.players.size===2){
        if(!r.replayRequester)return ws.send(JSON.stringify({type:"error",message:"لا يوجد طلب مباراة أخرى"}));
        const first=[...r.players.keys()][0],other=[...r.players.keys()].find(x=>x!==first);
        if(id!==other)return ws.send(JSON.stringify({type:"error",message:"الموافقة أو الرفض من اللاعب الآخر فقط"}));
        if(m.accept){
          clearTimeout(r.timer);
          r.replayRequester=null;
          r.phase="auction";r.round=1;r.used=new Set();r.current=null;r.bid=0;r.highest=null;r.bids=[];r.endsAt=0;r.skipUsed=new Set();r.turn=null;r.tierExposure={Legend:0,Elite:0,Strong:0,Average:0,Weak:0};
          for(const p of r.players.values()){p.budget=r.startBudget;p.team=[]}
          startRound(r);
        }else{
          broadcast(r,{type:"returnHome",message:"تم رفض طلب المباراة الأخرى. تم إنهاء الغرفة."});
          clearTimeout(r.timer);
          rooms.delete(room);
          for(const c of r.clients){try{c.close()}catch(e){}}
        }
      }
    }
  });

  ws.on("close",()=>{
    if(!room||!rooms.has(room)) return;
    const r=rooms.get(room);
    const leaving=r.players.get(id);
    r.clients.delete(ws);
    r.players.delete(id);

    clearTimeout(r.timer);
    // بعد ظهور النتيجة، خروج أحد اللاعبين لا يؤثر على شاشة النتيجة عند الآخر.
    // لا نرسل رسالة مغادرة ولا نغلق غرفة اللاعب الباقي.
    if(r.phase==="done"){
      if(r.players.size===0){rooms.delete(room);broadcastRooms();}
      return;
    }
    // أثناء اللوبي أو المزاد فقط: خروج الخصم ينهي المباراة ويبلغ اللاعب الباقي.
    if(r.players.size>0){
      const message=`${leaving?.name||"خصمك"} غادر الغرفة. تم إنهاء المباراة.`;
      broadcast(r,{type:"opponentLeft",message});
      setTimeout(()=>{ if(rooms.get(room)===r) rooms.delete(room); broadcastRooms(); },500);
    }else{
      rooms.delete(room);broadcastRooms();
    }
  });
});
server.listen(PORT,"0.0.0.0",()=>console.log("Yousef Games — Football Auction running on port "+PORT));
