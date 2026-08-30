const http=require("http"),fs=require("fs"),path=require("path"),https=require("https"),WebSocket=require("ws");
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
const roundPositions=["GK","RB","CB","CB","LB","CDM","CM","CM","LW","RW","ST"];
const category={GK:"حراسة",RB:"دفاع",CB:"دفاع",LB:"دفاع",CDM:"وسط",CM:"وسط",LW:"هجوم",RW:"هجوم",ST:"هجوم"};
const aliases={"Kylian Mbappe":"Kylian Mbappé","Vinicius Junior":"Vinícius Júnior","Mohamed Salah":"Mohamed Salah","Pele":"Pelé","Kaka":"Kaká"};
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript",".css":"text/css",".json":"application/json",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".svg":"image/svg+xml"};
function roomCode(){let s="";do{s=Math.random().toString(36).slice(2,6).toUpperCase()}while(rooms.has(s));return s}
function publicState(r){
  const pos=(r.roundPositions||roundPositions)[r.round-1];
  return {
    phase:r.phase,
    round:r.round,
    totalRounds:r.totalRounds||11,
    bid:r.bid,
    highest:r.highest,
    turn:r.turn||null,
    endsAt:r.endsAt,
    current:r.current,
    bids:r.bids,
    roundPosition:pos,
    roundLabel:category[pos],
    mode:r.mode,
    players:Object.fromEntries([...r.players].map(([id,p])=>{
      const teamIds=Array.isArray(p.team)?p.team:[];
      const teamPlayers=teamIds.map(playerId=>players.find(x=>x.id===playerId)).filter(Boolean);
      return [id,{
        name:p.name,
        photo:p.photo||"",
        budget:p.budget,
        team:teamIds,
        teamPlayers
      }];
    }))
  };
}
function broadcast(r,msg){for(const c of r.clients)if(c.readyState===1)c.send(JSON.stringify(msg))}
function pickForPosition(r,pos){const available=players.filter(p=>!r.used.has(p.id)&&p.position===pos);if(!available.length)return null;const weights=available.map(p=>p.tier==="Legend"?.45:p.tier==="Elite"?1:p.tier==="Strong"?1.35:1.6);let total=weights.reduce((a,b)=>a+b,0),x=Math.random()*total;for(let i=0;i<available.length;i++){x-=weights[i];if(x<=0)return available[i]}return available[0]}
function startRound(r){const pos=(r.roundPositions||roundPositions)[r.round-1],p=pickForPosition(r,pos);if(!p){finishGame(r);return}r.used.add(p.id);r.current=p;r.bid=1;r.highest=null;r.bids=[];r.endsAt=Date.now()+20000;r.skipUsed=new Set();const ids=[...r.players.keys()].filter(x=>(r.players.get(x)?.budget||0)>=1);if(!ids.length){finishRound(r);return}r.turn=ids[Math.floor(Math.random()*ids.length)];broadcast(r,{type:"state",state:publicState(r)});clearTimeout(r.timer);r.timer=setTimeout(()=>finishRound(r),20100)}
function finishRound(r){
  if(r.phase!=="auction")return;
  clearTimeout(r.timer);
  let winnerId=r.highest;
  if(!winnerId){const ids=[...r.players.keys()];winnerId=ids[Math.floor(Math.random()*ids.length)]}
  const winner=r.players.get(winnerId),loserId=[...r.players.keys()].find(x=>x!==winnerId);
  let replacement=null;
  if(winner&&winner.budget>=r.bid){
    winner.budget-=r.bid;
    winner.team.push(r.current.id);
    if(loserId){
      replacement=pickForPosition(r,r.current.position);
      // If that exact position is exhausted, give the skipped player the best unused player.
      if(!replacement){
        const fallback=players.filter(p=>!r.used.has(p.id)).sort((a,b)=>b.overall-a.overall)[0];
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
  // Send the updated squads immediately so both clients refresh their "My Team" panel.
  broadcast(r,{type:"roundEnd",...summary,state:publicState(r)});
  r.round++;
  if(r.round>(r.totalRounds||11)){
    // Keep the final auction-result screen visible for the same 4-second pause,
    // then show the dedicated match-simulation screen for another 4 seconds.
    setTimeout(()=>{
      broadcast(r,{type:"matchPreparing",seconds:4});
      setTimeout(()=>finishGame(r),4000);
    },4000);
    return;
  }
  setTimeout(()=>startRound(r),4000);
}
function avg(arr,fn){return arr.length?arr.reduce((s,x)=>s+fn(x),0)/arr.length:55}
function teamRatings(p){
  const arr=p.team.map(id=>players.find(x=>x.id===id)).filter(Boolean);
  const by=pos=>arr.filter(x=>x.position===pos);
  const gk=avg(by("GK"),x=>x.overall);
  const def=avg(arr.filter(x=>["RB","CB","LB"].includes(x.position)),x=>x.overall);
  const mid=avg(arr.filter(x=>["CDM","CM","AM"].includes(x.position)),x=>x.overall);
  const att=avg(arr.filter(x=>["LW","RW","ST","AM"].includes(x.position)),x=>x.overall);
  const passing=avg(arr,x=>x.passing);
  const shooting=avg(arr.filter(x=>["LW","RW","ST","AM"].includes(x.position)),x=>x.shooting);
  const defending=avg(arr.filter(x=>["GK","RB","CB","LB","CDM","CM"].includes(x.position)),x=>x.defending);
  return {gk,def,mid,att,passing,shooting,defending,overall:avg(arr,x=>x.overall)}
}
function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
function chooseScorer(arr,seed=0){
  const preferred=arr.filter(x=>["ST","LW","RW","AM"].includes(x.position));
  const pool=preferred.length?preferred:arr;
  if(!pool.length)return null;
  const ranked=pool.map(x=>({x,score:x.shooting*.55+x.overall*.30+x.passing*.08+x.stamina*.07})).sort((a,b)=>b.score-a.score);
  return ranked[((seed%ranked.length)+ranked.length)%ranked.length].x;
}
function squadFingerprint(team){return team.slice().sort((a,b)=>a-b).join("-")}
function deterministicNoise(seed){let h=2166136261;for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,16777619)}return ((h>>>0)%10000)/10000}
function teamBalance(arr){
  if(!arr.length)return 0;
  const positions=new Set(arr.map(x=>x.position));
  let score=0;
  if(positions.has("GK"))score+=1;
  if([...positions].some(x=>["RB","CB","LB"].includes(x)))score+=1;
  if([...positions].some(x=>["CDM","CM","AM"].includes(x)))score+=1;
  if([...positions].some(x=>["LW","RW","ST","AM"].includes(x)))score+=1;
  return score/4;
}
function finishGame(r){
  r.phase="done"; clearTimeout(r.timer);
  const ps=[...r.players.values()]; if(ps.length!==2)return;
  const A=teamRatings(ps[0]), B=teamRatings(ps[1]);
  const arrA=ps[0].team.map(id=>players.find(x=>x.id===id)).filter(Boolean);
  const arrB=ps[1].team.map(id=>players.find(x=>x.id===id)).filter(Boolean);
  const balanceA=teamBalance(arrA), balanceB=teamBalance(arrB);
  const strengthA=.27*A.att+.22*A.mid+.16*A.shooting+.12*A.passing+.11*A.overall+.07*A.gk+.05*A.def;
  const strengthB=.27*B.att+.22*B.mid+.16*B.shooting+.12*B.passing+.11*B.overall+.07*B.gk+.05*B.def;
  const pressureA=(A.att*.36+A.mid*.26+A.shooting*.20+A.passing*.18)-(B.def*.50+B.gk*.50);
  const pressureB=(B.att*.36+B.mid*.26+B.shooting*.20+B.passing*.18)-(A.def*.50+A.gk*.50);
  // محرك AI حتمي: نفس التشكيلتين تعطيان نفس النتيجة، لكن النتيجة تتأثر بالتوازن والتكتيك والجودة.
  const seed=squadFingerprint(ps[0].team)+"|"+squadFingerprint(ps[1].team);
  const nA=deterministicNoise(seed+"A")-.5, nB=deterministicNoise(seed+"B")-.5;
  const xgA=clamp(.45+pressureA*.035+(strengthA-strengthB)*.018+balanceA*.28-balanceB*.10+nA*.28,.12,4.25);
  const xgB=clamp(.45+pressureB*.035+(strengthB-strengthA)*.018+balanceB*.28-balanceA*.10+nB*.28,.12,4.25);
  const finishingA=clamp(A.shooting*.58+A.att*.27+A.mid*.15,45,99);
  const finishingB=clamp(B.shooting*.58+B.att*.27+B.mid*.15,45,99);
  const defensiveA=clamp(A.defending*.58+A.def*.18+A.gk*.24,45,99);
  const defensiveB=clamp(B.defending*.58+B.def*.18+B.gk*.24,45,99);
  function goalsFromXg(xg,finishing,oppDef,noise){
    const quality=(finishing-70)*.016-(oppDef-70)*.012+noise*.18;
    const raw=xg+quality;
    // توزيع أهداف قريب من الواقع مع سقف يمنع النتائج المبالغ فيها.
    if(raw<.48)return 0;
    if(raw<1.28)return 1;
    if(raw<2.18)return 2;
    if(raw<3.12)return 3;
    if(raw<4.05)return 4;
    return 5;
  }
  const ga=goalsFromXg(xgA,finishingA,defensiveB,nA);
  const gb=goalsFromXg(xgB,finishingB,defensiveA,nB);
  const events=[];
  function goal(teamIndex,goalIndex){
    const minute=teamIndex===0
      ? clamp(9+goalIndex*19+Math.round((100-A.mid)/12),2,89)
      : clamp(16+goalIndex*21+Math.round((100-B.mid)/12),3,90);
    const arr=teamIndex===0?arrA:arrB,scorer=chooseScorer(arr,goalIndex);
    if(!scorer)return;
    const assistPool=arr.filter(x=>x.id!==scorer.id&&["CM","CDM","AM","LW","RW","ST"].includes(x.position));
    const assist=assistPool.length?chooseScorer(assistPool,goalIndex+1):null;
    events.push({minute,team:teamIndex,scorer:scorer.name,assist:assist?.name||null});
  }
  for(let i=0;i<ga;i++)goal(0,i); for(let i=0;i<gb;i++)goal(1,i);
  events.sort((a,b)=>a.minute-b.minute);

  const possessionA=Math.round(Math.max(38,Math.min(62,50+(A.mid-B.mid)*.55+(A.passing-B.passing)*.12)));
  const possessionB=100-possessionA;
  const log=[
    `1' — 🏟️ انطلاق المباراة`,
    `12' — 🧠 استحواذ ${ps[0].name}: ${possessionA}% مقابل ${possessionB}%`,
    `24' — ⚡ هجمة خطيرة وتدخل دفاعي في الوقت المناسب`,
    `38' — 🧤 تصدٍ مهم من حارس المرمى`,
    `45+1' — ⏱️ نهاية الشوط الأول`,
    `57' — 🔥 ضغط متواصل ومحاولة مرتدة`,
    `68' — 🧠 قراءة تكتيكية وتغييرات في طريقة اللعب`,
    `79' — 🎯 فرصة محققة تضيع`,
    `90+3' — 🏁 صافرة النهاية`
  ];
  const goalLines=events.map(e=>`${e.minute}' — ⚽ ${e.scorer} (${e.team===0?ps[0].name:ps[1].name})${e.assist?` — صناعة ${e.assist}`:""}`);
  const fullLog=[...log.slice(0,4),...goalLines,...log.slice(4)];
  fullLog.push(`🤖 بوت الذكاء الاصطناعي حلّل التشكيلتين: قوة ${ps[0].name} ${strengthA.toFixed(1)} مقابل ${strengthB.toFixed(1)}`);
  fullLog.push(`🧠 القرار مبني على الهجوم والوسط والدفاع والحراسة والتمرير والتسديد، وليس على نتيجة عشوائية.`);
  fullLog.push(`🎯 xG: ${xgA.toFixed(2)} مقابل ${xgB.toFixed(2)}`);
  fullLog.push(`📊 الاستحواذ المتوقع: ${possessionA}% مقابل ${possessionB}%`);

  // Save persistent match records and points.
  if(ps.length===2){const [a,b]=ps;const pa=touchProfile(a),pb=touchProfile(b);pa.matches++;pb.matches++;if(ga>gb){pa.wins++;pb.losses++;pa.points+=3}else if(gb>ga){pb.wins++;pa.losses++;pb.points+=3}else{pa.draws++;pb.draws++;pa.points++;pb.points++}saveProfiles()}
  broadcast(r,{type:"leaderboard",players:leaderboard()});
  broadcast(r,{type:"result",result:{
    score:`${ps[0].name} ${ga} — ${gb} ${ps[1].name}`,
    log:fullLog,
    goals:events,
    teams:{
      a:{
        name:ps[0].name,
        photo:ps[0].photo||"",
        budget:ps[0].budget,
        team:Array.isArray(ps[0].team)?ps[0].team:[],
        teamPlayers:arrA
      },
      b:{
        name:ps[1].name,
        photo:ps[1].photo||"",
        budget:ps[1].budget,
        team:Array.isArray(ps[1].team)?ps[1].team:[],
        teamPlayers:arrB
      }
    },
    ai:{strengthA,strengthB,xgA,xgB,possessionA,possessionB}
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
      const r={phase:"lobby",round:0,players:new Map(),clients:new Set(),used:new Set(),current:null,bid:0,highest:null,bids:[],endsAt:0,timer:null,skipUsed:new Set(),turn:null,replayRequester:null,teamSize,startBudget:budget,totalRounds:teamSize,roundPositions:positions,mode:teamSize===5?"خماسية":"11 لاعب"};
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
          r.phase="auction";r.round=1;r.used=new Set();r.current=null;r.bid=0;r.highest=null;r.bids=[];r.endsAt=0;r.skipUsed=new Set();r.turn=null;
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
server.listen(PORT,()=>console.log("Yousef Games — Football Auction running on port "+PORT));

