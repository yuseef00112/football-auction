const http=require("http"),
fs=require("fs"),
path=require("path"),
https=require("https"),
WebSocket=require("ws");
const server = http.createServer((req, res) => {

   const requestPath = req.url
    ? decodeURIComponent(req.url.split("?")[0])
    : "/";

  let filePath;

  if (
    requestPath === "/" ||
    requestPath === "/index.html"
  ) {

    filePath = path.join(
      __dirname,
      "index.html"
    );

  } else {

    filePath = path.join(
      __dirname,
      requestPath.replace(/^\/+/, "")
    );

  }

  fs.readFile(
    filePath,
    (error, content) => {

      if (error) {

        res.writeHead(404, {
          "Content-Type": "text/plain; charset=utf-8"
        });

        res.end("File Not Found");

        return;
      }

      let contentType = "text/html; charset=utf-8";

      if (filePath.endsWith(".js")) {
        contentType = "application/javascript";
      }

      if (filePath.endsWith(".css")) {
        contentType = "text/css";
      }

      if (filePath.endsWith(".png")) {
        contentType = "image/png";
      }

      if (
        filePath.endsWith(".jpg") ||
        filePath.endsWith(".jpeg")
      ) {
        contentType = "image/jpeg";
      }

      res.writeHead(200, {
        "Content-Type": contentType
      });

      res.end(content);

       }
  );

});

const PORT=process.env.PORT||3000;
const rooms=new Map();
const photoCache=new Map();

const profilesFile=path.join(__dirname,"profiles.json");

let profiles={};

try{
  profiles=JSON.parse(fs.readFileSync(profilesFile,"utf8"));
}catch(e){
  profiles={};
}

function saveProfiles(){
  try{
    fs.writeFileSync(
      profilesFile,
      JSON.stringify(profiles,null,2)
    );
  }catch(e){}
}

function profileKey(p){
  return p.profileId||p.name||"لاعب";
}

function touchProfile(p){

  const k=profileKey(p);

  profiles[k]||={
    name:p.name||"لاعب",
    photo:p.photo||"",
    matches:0,
    wins:0,
    losses:0,
    draws:0,
    points:0
  };

  profiles[k].name=p.name||profiles[k].name;
  profiles[k].photo=p.photo||profiles[k].photo||"";

  return profiles[k];
}

function leaderboard(){

  return Object.entries(profiles)
    .map(([id,p])=>({
      id,
      ...p
    }))
    .sort(
      (a,b)=>
        b.points-a.points||
        b.wins-a.wins||
        a.losses-b.losses
    );
}

function publicRooms(){

  return [...rooms.entries()]
    .filter(([_,r])=>r.phase==="lobby")
    .map(([code,r])=>{

      const host=[...r.players.values()][0];

      return{
        code,
        owner:host?.name||"لاعب",
        mode:r.mode,
        teamSize:r.teamSize,
        budget:r.startBudget,
        count:r.players.size
      };
    });
}

function broadcastRooms(){

  const msg=JSON.stringify({
    type:"publicRooms",
    rooms:publicRooms()
  });

  for(const client of wss.clients){

    if(client.readyState===1){
      client.send(msg);
    }

  }
}

/* =========================================
   قاعدة اللاعبين
   ========================================= */

const players=[];

function generatedPlayerStats(
  name,
  position,
  overall,
  extra={}
){

  const level=overall;

  let pace=level;
  let shooting=level;
  let passing=level;
  let dribbling=level;
  let defending=level;
  let physical=level;
  let stamina=level;

  if(position==="GK"){

    pace=Math.max(30,level-30);
    shooting=Math.max(15,level-45);
    passing=Math.max(35,level-25);
    dribbling=Math.max(30,level-28);
    defending=Math.min(99,level+5);
    physical=Math.min(99,level+3);
    stamina=Math.min(99,level+1);

  }

  if(["CB","RB","LB"].includes(position)){

    pace=Math.min(99,level+8);
    shooting=Math.max(25,level-20);
    passing=level;
    dribbling=Math.max(35,level-10);
    defending=Math.min(99,level+10);
    physical=Math.min(99,level+8);
    stamina=Math.min(99,level+6);

  }

  if(["CDM","CM","AM"].includes(position)){

    pace=Math.min(99,level+3);
    shooting=Math.min(99,level+2);
    passing=Math.min(99,level+9);
    dribbling=Math.min(99,level+7);
    defending=position==="CDM"
      ?Math.min(99,level+7)
      :Math.max(35,level-5);

    physical=Math.min(99,level+3);
    stamina=Math.min(99,level+6);
  }

  if(["LW","RW"].includes(position)){

    pace=Math.min(99,level+12);
    shooting=Math.min(99,level+7);
    passing=Math.min(99,level+4);
    dribbling=Math.min(99,level+10);
    defending=Math.max(20,level-25);
    physical=Math.max(35,level-8);
    stamina=Math.min(99,level+5);
  }

  if(position==="ST"){

    pace=Math.min(99,level+8);
    shooting=Math.min(99,level+12);
    passing=Math.max(35,level-4);
    dribbling=Math.min(99,level+5);
    defending=Math.max(15,level-35);
    physical=Math.min(99,level+7);
    stamina=Math.min(99,level+4);
  }

  return{
    pace,
    shooting,
    passing,
    dribbling,
    defending,
    physical,
    stamina,
    ...extra
  };
}

let nextPlayerId=1;

function addPlayer(
  name,
  position,
  club,
  country,
  overall,
  tier="Medium",
  extra={}
){

  players.push({

    id:nextPlayerId++,

    name,
    position,
    club,
    country,
    overall,

    ...generatedPlayerStats(
      name,
      position,
      overall,
      extra
    ),

    tier,

    basePrice:
      overall>=90?10:
      overall>=85?8:
      overall>=80?6:
      overall>=75?4:
      overall>=70?3:
      2,

    retired:false
  });
}

/* =========================================
   لاعبين نخبة
   ========================================= */

[
  ["Kylian Mbappe","ST","Real Madrid","France",91,"Elite"],
  ["Erling Haaland","ST","Manchester City","Norway",91,"Elite"],
  ["Vinicius Junior","LW","Real Madrid","Brazil",90,"Elite"],
  ["Jude Bellingham","CM","Real Madrid","England",90,"Elite"],
  ["Mohamed Salah","RW","Liverpool","Egypt",89,"Elite"],
  ["Harry Kane","ST","Bayern Munich","England",89,"Elite"],
  ["Rodri","CDM","Manchester City","Spain",90,"Elite"],
  ["Kevin De Bruyne","CM","Manchester City","Belgium",88,"Elite"],
  ["Lamine Yamal","RW","Barcelona","Spain",89,"Elite"],
  ["Bukayo Saka","RW","Arsenal","England",88,"Elite"],
  ["Phil Foden","AM","Manchester City","England",88,"Elite"],
  ["Florian Wirtz","AM","Liverpool","Germany",88,"Elite"],
  ["Pedri","CM","Barcelona","Spain",87,"Strong"],
  ["Federico Valverde","CM","Real Madrid","Uruguay",88,"Elite"],
  ["Martin Odegaard","AM","Arsenal","Norway",87,"Strong"],
  ["Declan Rice","CDM","Arsenal","England",87,"Strong"],
  ["William Saliba","CB","Arsenal","France",87,"Strong"],
  ["Virgil van Dijk","CB","Liverpool","Netherlands",87,"Strong"],
  ["Antonio Rudiger","CB","Real Madrid","Germany",86,"Strong"],
  ["Alisson Becker","GK","Liverpool","Brazil",89,"Elite"],
  ["Thibaut Courtois","GK","Real Madrid","Belgium",89,"Elite"],
  ["Jan Oblak","GK","Atletico Madrid","Slovenia",87,"Strong"],
  ["Achraf Hakimi","RB","PSG","Morocco",86,"Strong"],
  ["Theo Hernandez","LB","AC Milan","France",86,"Strong"],
  ["Rafael Leao","LW","AC Milan","Portugal",86,"Strong"],
  ["Khvicha Kvaratskhelia","LW","PSG","Georgia",86,"Strong"],
  ["Nico Williams","LW","Athletic Club","Spain",85,"Strong"],
  ["Ousmane Dembele","RW","PSG","France",87,"Strong"],
  ["Lautaro Martinez","ST","Inter","Argentina",88,"Elite"],
  ["Victor Osimhen","ST","Galatasaray","Nigeria",86,"Strong"],
  ["Robert Lewandowski","ST","Barcelona","Poland",88,"Elite"],
  ["Antoine Griezmann","AM","Atletico Madrid","France",87,"Strong"],
  ["Bernardo Silva","AM","Manchester City","Portugal",87,"Strong"],
  ["Bruno Fernandes","AM","Manchester United","Portugal",87,"Strong"],
  ["Joshua Kimmich","CDM","Bayern Munich","Germany",86,"Strong"],
  ["Trent Alexander-Arnold","RB","Liverpool","England",86,"Strong"],
  ["Alphonso Davies","LB","Bayern Munich","Canada",84,"Strong"],
  ["Gavi","CM","Barcelona","Spain",83,"Strong"],
  ["Luis Diaz","LW","Liverpool","Colombia",84,"Strong"],
  ["Cole Palmer","AM","Chelsea","England",86,"Strong"],
  ["Jamal Musiala","AM","Bayern Munich","Germany",88,"Elite"],
  ["Ruben Dias","CB","Manchester City","Portugal",86,"Strong"],
  ["Marquinhos","CB","PSG","Brazil",86,"Strong"],
  ["Mike Maignan","GK","AC Milan","France",87,"Strong"],
  ["Gianluigi Donnarumma","GK","PSG","Italy",89,"Elite"]
].forEach(p=>addPlayer(...p));

/* =========================================
   الدوري الإنجليزي
   لاعبين أقوياء ومتوسطين
   ========================================= */

[
  ["Dominik Szoboszlai","CM","Liverpool","Hungary",82,"Strong"],
  ["Alexis Mac Allister","CM","Liverpool","Argentina",84,"Strong"],
  ["Ryan Gravenberch","CM","Liverpool","Netherlands",80,"Medium"],
  ["Curtis Jones","CM","Liverpool","England",78,"Medium"],
  ["Cody Gakpo","LW","Liverpool","Netherlands",81,"Strong"],
  ["Darwin Nunez","ST","Liverpool","Uruguay",79,"Medium"],
  ["Diogo Jota","ST","Liverpool","Portugal",82,"Strong"],
  ["Ibrahima Konate","CB","Liverpool","France",82,"Strong"],
  ["Andrew Robertson","LB","Liverpool","Scotland",81,"Strong"],

  ["Martinelli","LW","Arsenal","Brazil",82,"Strong"],
  ["Kai Havertz","ST","Arsenal","Germany",82,"Strong"],
  ["Gabriel Jesus","ST","Arsenal","Brazil",80,"Medium"],
  ["Thomas Partey","CDM","Arsenal","Ghana",80,"Medium"],
  ["Jorginho","CM","Arsenal","Italy",78,"Medium"],
  ["Ben White","RB","Arsenal","England",82,"Strong"],
  ["Gabriel Magalhaes","CB","Arsenal","Brazil",83,"Strong"],

  ["Jeremy Doku","LW","Manchester City","Belgium",80,"Medium"],
  ["Savinho","RW","Manchester City","Brazil",78,"Medium"],
  ["Mateo Kovacic","CM","Manchester City","Croatia",80,"Medium"],
  ["John Stones","CB","Manchester City","England",82,"Strong"],
  ["Nathan Ake","CB","Manchester City","Netherlands",81,"Strong"],

  ["Alejandro Garnacho","LW","Manchester United","Argentina",79,"Medium"],
  ["Rasmus Hojlund","ST","Manchester United","Denmark",78,"Medium"],
  ["Kobbie Mainoo","CM","Manchester United","England",78,"Medium"],
  ["Mason Mount","AM","Manchester United","England",77,"Medium"],
  ["Lisandro Martinez","CB","Manchester United","Argentina",81,"Strong"],
  ["Diogo Dalot","RB","Manchester United","Portugal",79,"Medium"],

  ["Son Heung-min","LW","Tottenham","South Korea",86,"Strong"],
  ["James Maddison","AM","Tottenham","England",82,"Strong"],
  ["Brennan Johnson","RW","Tottenham","Wales",77,"Medium"],
  ["Richarlison","ST","Tottenham","Brazil",78,"Medium"],
  ["Cristian Romero","CB","Tottenham","Argentina",82,"Strong"],

  ["Ollie Watkins","ST","Aston Villa","England",83,"Strong"],
  ["Morgan Rogers","AM","Aston Villa","England",76,"Medium"],
  ["Youri Tielemans","CM","Aston Villa","Belgium",80,"Medium"],
  ["Ezri Konsa","CB","Aston Villa","England",78,"Medium"],

  ["Jarrod Bowen","RW","West Ham","England",81,"Strong"],
  ["Mohammed Kudus","AM","West Ham","Ghana",80,"Medium"],
  ["Lucas Paqueta","AM","West Ham","Brazil",81,"Strong"],

  ["Anthony Gordon","LW","Newcastle","England",81,"Strong"],
  ["Alexander Isak","ST","Newcastle","Sweden",84,"Strong"],
  ["Bruno Guimaraes","CM","Newcastle","Brazil",83,"Strong"],
  ["Sandro Tonali","CM","Newcastle","Italy",80,"Medium"]
].forEach(p=>addPlayer(...p));

/* =========================================
   الدوري الإسباني
   ========================================= */

[
  ["Ferran Torres","RW","Barcelona","Spain",79,"Medium"],
  ["Dani Olmo","AM","Barcelona","Spain",82,"Strong"],
  ["Frenkie de Jong","CM","Barcelona","Netherlands",85,"Strong"],
  ["Alejandro Balde","LB","Barcelona","Spain",78,"Medium"],
  ["Pau Cubarsi","CB","Barcelona","Spain",78,"Medium"],
  ["Inigo Martinez","CB","Barcelona","Spain",80,"Medium"],

  ["Rodrygo","RW","Real Madrid","Brazil",85,"Strong"],
  ["Brahim Diaz","RW","Real Madrid","Morocco",80,"Medium"],
  ["Eduardo Camavinga","CM","Real Madrid","France",84,"Strong"],
  ["Aurelien Tchouameni","CDM","Real Madrid","France",85,"Strong"],
  ["Ferland Mendy","LB","Real Madrid","France",80,"Medium"],
  ["Dani Carvajal","RB","Real Madrid","Spain",84,"Strong"],

  ["Julian Alvarez","ST","Atletico Madrid","Argentina",84,"Strong"],
  ["Pablo Barrios","CM","Atletico Madrid","Spain",77,"Medium"],
  ["Nahuel Molina","RB","Atletico Madrid","Argentina",78,"Medium"],
  ["Jose Gimenez","CB","Atletico Madrid","Uruguay",82,"Strong"],

  ["Takefusa Kubo","RW","Real Sociedad","Japan",80,"Medium"],
  ["Mikel Oyarzabal","ST","Real Sociedad","Spain",81,"Strong"],
  ["Martin Zubimendi","CDM","Real Sociedad","Spain",83,"Strong"],

  ["Ayoze Perez","LW","Villarreal","Spain",78,"Medium"],
  ["Gerard Moreno","ST","Villarreal","Spain",81,"Strong"],

  ["Iago Aspas","ST","Celta Vigo","Spain",78,"Medium"],
  ["Isco","AM","Real Betis","Spain",82,"Strong"],
  ["Sergio Canales","AM","Monterrey","Spain",79,"Medium"]
].forEach(p=>addPlayer(...p));

/* =========================================
   الدوري الإيطالي
   ========================================= */

[
  ["Marcus Thuram","ST","Inter","France",83,"Strong"],
  ["Hakan Calhanoglu","CM","Inter","Turkey",84,"Strong"],
  ["Nicolo Barella","CM","Inter","Italy",85,"Strong"],
  ["Alessandro Bastoni","CB","Inter","Italy",85,"Strong"],
  ["Federico Dimarco","LB","Inter","Italy",82,"Strong"],

  ["Dusan Vlahovic","ST","Juventus","Serbia",82,"Strong"],
  ["Kenan Yildiz","LW","Juventus","Turkey",78,"Medium"],
  ["Manuel Locatelli","CDM","Juventus","Italy",80,"Medium"],
  ["Bremer","CB","Juventus","Brazil",83,"Strong"],

  ["Christian Pulisic","RW","AC Milan","USA",82,"Strong"],
  ["Tijjani Reijnders","CM","AC Milan","Netherlands",82,"Strong"],
  ["Fikayo Tomori","CB","AC Milan","England",81,"Strong"],

  ["Paulo Dybala","AM","Roma","Argentina",83,"Strong"],
  ["Artem Dovbyk","ST","Roma","Ukraine",80,"Medium"],
  ["Lorenzo Pellegrini","CM","Roma","Italy",79,"Medium"],

  ["Romelu Lukaku","ST","Napoli","Belgium",81,"Strong"],
  ["Stanislav Lobotka","CDM","Napoli","Slovakia",81,"Strong"],
  ["Alessandro Buongiorno","CB","Napoli","Italy",80,"Medium"],

  ["Ademola Lookman","LW","Atalanta","Nigeria",82,"Strong"],
  ["Charles De Ketelaere","AM","Atalanta","Belgium",80,"Medium"]
].forEach(p=>addPlayer(...p));

/* =========================================
   الدوري الفرنسي
   ========================================= */

[
  ["Bradley Barcola","LW","PSG","France",81,"Strong"],
  ["Warren Zaire-Emery","CM","PSG","France",81,"Strong"],
  ["Joao Neves","CM","PSG","Portugal",84,"Strong"],
  ["Goncalo Ramos","ST","PSG","Portugal",80,"Medium"],
  ["Nuno Mendes","LB","PSG","Portugal",83,"Strong"],

  ["Jonathan David","ST","Lille","Canada",81,"Strong"],
  ["Edon Zhegrova","RW","Lille","Kosovo",77,"Medium"],
  ["Benjamin Andre","CDM","Lille","France",76,"Medium"],

  ["Pierre-Emerick Aubameyang","ST","Marseille","Gabon",80,"Medium"],
  ["Mason Greenwood","RW","Marseille","England",81,"Strong"],

  ["Alexandre Lacazette","ST","Lyon","France",78,"Medium"],
  ["Rayan Cherki","AM","Lyon","France",78,"Medium"]
].forEach(p=>addPlayer(...p));

/* =========================================
   الدوري البرتغالي
   ========================================= */

[
  ["Viktor Gyokeres","ST","Sporting CP","Sweden",85,"Strong"],
  ["Pedro Goncalves","AM","Sporting CP","Portugal",81,"Strong"],
  ["Morten Hjulmand","CDM","Sporting CP","Denmark",80,"Medium"],

  ["Angel Di Maria","RW","Benfica","Argentina",80,"Medium"],
  ["Orkun Kokcu","CM","Benfica","Turkey",80,"Medium"],
  ["Antonio Silva","CB","Benfica","Portugal",79,"Medium"],

  ["Samu Omorodion","ST","Porto","Spain",78,"Medium"],
  ["Alan Varela","CDM","Porto","Argentina",79,"Medium"],
  ["Francisco Moura","LB","Porto","Portugal",75,"Medium"]
].forEach(p=>addPlayer(...p));

/* =========================================
   الدوري الألماني
   ========================================= */

[
  ["Leroy Sane","RW","Bayern Munich","Germany",84,"Strong"],
  ["Serge Gnabry","RW","Bayern Munich","Germany",81,"Strong"],
  ["Leon Goretzka","CM","Bayern Munich","Germany",82,"Strong"],
  ["Dayot Upamecano","CB","Bayern Munich","France",82,"Strong"],

  ["Xavi Simons","AM","RB Leipzig","Netherlands",82,"Strong"],
  ["Benjamin Sesko","ST","RB Leipzig","Slovenia",81,"Strong"],
  ["Lois Openda","ST","RB Leipzig","Belgium",82,"Strong"],

  ["Victor Boniface","ST","Bayer Leverkusen","Nigeria",80,"Medium"],
  ["Alejandro Grimaldo","LB","Bayer Leverkusen","Spain",83,"Strong"],
  ["Jeremie Frimpong","RB","Bayer Leverkusen","Netherlands",83,"Strong"],
  ["Robert Andrich","CDM","Bayer Leverkusen","Germany",78,"Medium"],

  ["Serhou Guirassy","ST","Borussia Dortmund","Guinea",82,"Strong"],
  ["Karim Adeyemi","LW","Borussia Dortmund","Germany",78,"Medium"]
].forEach(p=>addPlayer(...p));

/* =========================================
   الدوري المصري
   ========================================= */

[
  ["Emam Ashour","CM","Al Ahly","Egypt",78,"Medium"],
  ["Ahmed Sayed Zizo","RW","Zamalek","Egypt",79,"Medium"],
  ["Mohamed El Shenawy","GK","Al Ahly","Egypt",78,"Medium"],
  ["Mohamed Abdelmonem","CB","Nice","Egypt",78,"Medium"],
  ["Mostafa Mohamed","ST","Nantes","Egypt",77,"Medium"],
  ["Trezeguet","LW","Al Rayyan","Egypt",79,"Medium"],
  ["Ramadan Sobhi","LW","Pyramids","Egypt",76,"Medium"],
  ["Marwan عطية","CDM","Al Ahly","Egypt",75,"Medium"],
  ["Hussein El Shahat","RW","Al Ahly","Egypt",75,"Medium"],
  ["Mohamed Hany","RB","Al Ahly","Egypt",74,"Medium"],
  ["Yasser Ibrahim","CB","Al Ahly","Egypt",75,"Medium"],
  ["Ahmed فتوح","LB","Zamalek","Egypt",75,"Medium"],
  ["Mostafa Shalaby","LW","Zamalek","Egypt",73,"Medium"],
  ["Nasser Maher","AM","Zamalek","Egypt",74,"Medium"]
].forEach(p=>addPlayer(...p));

/* =========================================
   لاعبين متوسطين وضعاف
   هؤلاء مهمون للتشويق وعدم ظهور النجوم فقط
   ========================================= */

[
  ["Rayan Ait-Nouri","LB","Wolves","Algeria",76,"Medium"],
  ["Joao Gomes","CM","Wolves","Brazil",75,"Medium"],
  ["Matheus Cunha","ST","Wolves","Brazil",79,"Medium"],
  ["Morgan Gibbs-White","AM","Nottingham Forest","England",77,"Medium"],
  ["Callum Hudson-Odoi","LW","Nottingham Forest","England",75,"Medium"],
  ["Chris Wood","ST","Nottingham Forest","New Zealand",74,"Medium"],
  ["Antoine Semenyo","RW","Bournemouth","Ghana",74,"Medium"],
  ["Dominic Solanke","ST","Tottenham","England",78,"Medium"],
  ["Eberechi Eze","AM","Crystal Palace","England",81,"Strong"],
  ["Michael Olise","RW","Bayern Munich","France",83,"Strong"],
  ["Jean-Philippe Mateta","ST","Crystal Palace","France",73,"Medium"],

  ["Abel Ruiz","ST","Girona","Spain",72,"Medium"],
  ["Bryan Zaragoza","LW","Osasuna","Spain",73,"Medium"],
  ["Aleix Garcia","CM","Bayer Leverkusen","Spain",76,"Medium"],
  ["Javi Guerra","CM","Valencia","Spain",75,"Medium"],

  ["Riccardo Orsolini","RW","Bologna","Italy",78,"Medium"],
  ["Andrea Pinamonti","ST","Genoa","Italy",73,"Medium"],
  ["Tommaso Baldanzi","AM","Roma","Italy",72,"Medium"],
  ["Davide Frattesi","CM","Inter","Italy",78,"Medium"],

  ["Elye Wahi","ST","Marseille","France",74,"Medium"],
  ["Akliouche","AM","Monaco","France",76,"Medium"],
  ["Amine Gouiri","ST","Rennes","Algeria",75,"Medium"],

  ["Francisco Conceicao","RW","Juventus","Portugal",77,"Medium"],
  ["Tiago Gouveia","RW","Benfica","Portugal",71,"Weak"],
  ["Andre Franco","CM","Porto","Portugal",70,"Weak"],

  ["Andreas Skov Olsen","RW","Club Brugge","Denmark",74,"Medium"],
  ["Santiago Gimenez","ST","AC Milan","Mexico",79,"Medium"],
  ["Luis Sinisterra","LW","Bournemouth","Colombia",73,"Medium"],

  ["Facundo Buonanotte","AM","Leicester","Argentina",72,"Medium"],
  ["Carlos Baleba","CDM","Brighton","Cameroon",74,"Medium"],
  ["Jack Hinshelwood","CM","Brighton","England",70,"Weak"],
  ["Lewis Hall","LB","Newcastle","England",73,"Medium"],

  ["Gift Orban","ST","Lyon","Nigeria",71,"Weak"],
  ["Kevin Schade","RW","Brentford","Germany",72,"Medium"],
  ["Jacob Ramsey","CM","Aston Villa","England",76,"Medium"],

  ["Yankuba Minteh","RW","Brighton","Gambia",72,"Medium"],
  ["Samuel Iling-Junior","LW","Aston Villa","England",70,"Weak"],
  ["Oscar Bobb","RW","Manchester City","Norway",74,"Medium"],

  ["Mika Biereth","ST","Monaco","Denmark",72,"Medium"],
  ["Roony Bardghji","RW","Barcelona","Sweden",70,"Weak"],
  ["Assan Ouedraogo","CM","RB Leipzig","Germany",69,"Weak"]
].forEach(p=>addPlayer(...p));

/* =========================================
   أساطير - احتمال ظهور قليل جدًا
   ========================================= */

[
  ["Lionel Messi","RW","Inter Miami","Argentina",97],
  ["Cristiano Ronaldo","ST","Al Nassr","Portugal",94],
  ["Zinedine Zidane","AM","Retired","France",96],
  ["Ronaldinho","AM","Retired","Brazil",96],
  ["Ronaldo Nazario","ST","Retired","Brazil",96],
  ["Thierry Henry","ST","Retired","France",95],
  ["Xavi","CM","Retired","Spain",94],
  ["Andres Iniesta","CM","Retired","Spain",94],
  ["Andrea Pirlo","CM","Retired","Italy",93],
  ["Paolo Maldini","CB","Retired","Italy",95],
  ["Franco Baresi","CB","Retired","Italy",94],
  ["Gianluigi Buffon","GK","Retired","Italy",94],
  ["Iker Casillas","GK","Retired","Spain",93],
  ["Didier Drogba","ST","Retired","Ivory Coast",94],
  ["Samuel Eto'o","ST","Retired","Cameroon",94],
  ["Kaka","AM","Retired","Brazil",93],
  ["Steven Gerrard","CM","Retired","England",92],
  ["Frank Lampard","CM","Retired","England",91],
  ["David Beckham","RW","Retired","England",90],
  ["Arjen Robben","RW","Retired","Netherlands",92],
  ["Zlatan Ibrahimovic","ST","Retired","Sweden",93],
  ["Luis Figo","RW","Retired","Portugal",92],
  ["Fabio Cannavaro","CB","Retired","Italy",92],
  ["Cafu","RB","Retired","Brazil",92],
  ["Roberto Carlos","LB","Retired","Brazil",92],
  ["Clarence Seedorf","CM","Retired","Netherlands",91],
  ["Patrick Vieira","CDM","Retired","France",91],
  ["Eric Cantona","ST","Retired","France",91],
  ["George Best","RW","Retired","Northern Ireland",94],
  ["Johan Cruyff","ST","Retired","Netherlands",97],
  ["Diego Maradona","AM","Retired","Argentina",97],
  ["Pele","ST","Retired","Brazil",98]
].forEach(([name,position,club,country,overall])=>{

  const player={
    id:nextPlayerId++,
    name,
    position,
    club,
    country,
    overall,
    ...generatedPlayerStats(
      name,
      position,
      overall
    ),
    tier:"Legend",
    basePrice:10,
    retired:true
  };

  players.push(player);
});

/* =========================================
   مراكز الجولات
   ========================================= */

const roundPositions=[
  "GK",
  "RB",
  "CB",
  "CB",
  "LB",
  "CDM",
  "CM",
  "CM",
  "LW",
  "RW",
  "ST"
];

const category={
  GK:"حراسة",
  RB:"دفاع",
  CB:"دفاع",
  LB:"دفاع",
  CDM:"وسط",
  CM:"وسط",
  AM:"وسط",
  LW:"هجوم",
  RW:"هجوم",
  ST:"هجوم"
};

const aliases={
  "Gavi":"Gavi",
  "Luis Diaz":"Luis Díaz",
  "Kylian Mbappe":"Kylian Mbappé",
  "Vinicius Junior":"Vinícius Júnior",
  "Mohamed Salah":"Mohamed Salah",
  "Pele":"Pelé",
  "Kaka":"Kaká"
};

const mime={
  ".html":"text/html; charset=utf-8",
  ".js":"text/javascript",
  ".css":"text/css",
  ".json":"application/json",
  ".png":"image/png",
  ".jpg":"image/jpeg",
  ".jpeg":"image/jpeg",
  ".svg":"image/svg+xml"
};

function roomCode(){

  let s="";

  do{
    s=Math.random()
      .toString(36)
      .slice(2,6)
      .toUpperCase();
  }while(rooms.has(s));

  return s;
}

function publicState(r){

  const pos=
    (r.roundPositions||roundPositions)
      [r.round-1];

  return{

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

    players:Object.fromEntries(

      [...r.players]
        .map(([id,p])=>[

          id,

          {
            name:p.name,
            photo:p.photo||"",
            budget:p.budget,
            team:p.team
          }

        ])

    )

  };
}

function broadcast(r,msg){

  for(const c of r.clients){

    if(c.readyState===1){
      c.send(JSON.stringify(msg));
    }

  }
}

/* =========================================
   اختيار اللاعب
   المتوسط والضعيف احتمالهما أعلى
   ========================================= */

function pickForPosition(r,pos){

  const available=players.filter(
    p=>
      !r.used.has(p.id)&&
      p.position===pos
  );

  if(!available.length){
    return null;
  }

  const weights=available.map(p=>{

    if(p.tier==="Legend"){
      return 0.08;
    }

    if(p.tier==="Elite"){
      return 0.35;
    }

    if(p.tier==="Strong"){
      return 0.90;
    }

    if(p.tier==="Medium"){
      return 2.40;
    }

    if(p.tier==="Weak"){
      return 2.10;
    }

    return 1.5;
  });

  const total=
    weights.reduce((a,b)=>a+b,0);

  let x=Math.random()*total;

  for(let i=0;i<available.length;i++){

    x-=weights[i];

    if(x<=0){
      return available[i];
    }

  }

  return available[0];
}

function startRound(r){

  const pos=
    (r.roundPositions||roundPositions)
      [r.round-1];

  const p=pickForPosition(r,pos);

  if(!p){
    finishGame(r);
    return;
  }

  r.used.add(p.id);

  r.current=p;

  /* السعر النهائي يبدأ من 1 */
  r.bid=1;

  r.highest=null;

  r.bids=[];

  r.endsAt=
    Date.now()+20000;

  r.skipUsed=new Set();

  /* فقط اللاعب الذي معه فلوس يدخل الدور */
  const ids=[...r.players.keys()]
    .filter(
      x=>
        (r.players.get(x)?.budget||0)>=1
    );

  if(!ids.length){
    finishRound(r);
    return;
  }

  r.turn=
    ids[
      Math.floor(
        Math.random()*ids.length
      )
    ];

  broadcast(r,{
    type:"state",
    state:publicState(r)
  });

  clearTimeout(r.timer);

  r.timer=setTimeout(
    ()=>finishRound(r),
    20100
  );
}

function finishRound(r){

  if(r.phase!=="auction"){
    return;
  }

  clearTimeout(r.timer);

  let winnerId=r.highest;

  /* لو محدش زايد
     اختيار لاعب معه فلوس */
  if(!winnerId){

    const availableIds=
      [...r.players.keys()]
        .filter(
          id=>
            (r.players.get(id)?.budget||0)>=1
        );

    if(availableIds.length){

      winnerId=
        availableIds[
          Math.floor(
            Math.random()*
            availableIds.length
          )
        ];
    }
  }

  const winner=
    winnerId
      ?r.players.get(winnerId)
      :null;

  const loserId=
    [...r.players.keys()]
      .find(x=>x!==winnerId);

  let replacement=null;

  if(
    winner&&
    winner.budget>=r.bid
  ){

    winner.budget-=r.bid;

    winner.team.push(
      r.current.id
    );

    if(loserId){

      replacement=
        pickForPosition(
          r,
          r.current.position
        );

      if(!replacement){

        const fallback=players
          .filter(
            p=>!r.used.has(p.id)
          )
          .sort(
            (a,b)=>
              b.overall-a.overall
          )[0];

        replacement=fallback||null;
      }

      if(replacement){

        r.used.add(
          replacement.id
        );

        r.players
          .get(loserId)
          .team
          .push(
            replacement.id
          );
      }
    }
  }

  const loser=
    loserId
      ?r.players.get(loserId)
      :null;

  const summary={

    winnerId:winnerId||null,

    loserId:loserId||null,

    player:r.current,

    replacement:
      replacement
        ?{
          player:replacement,
          reason:"skip"
        }
        :null,

    price:winner
      ?r.bid
      :0,

    winnerName:
      winner?.name||"—",

    loserName:
      loser?.name||"—"
  };

  broadcast(r,{
    type:"roundEnd",
    ...summary
  });

  r.round++;

  if(
    r.round>
    (r.totalRounds||11)
  ){

    setTimeout(()=>{

      broadcast(r,{
        type:"matchPreparing",
        seconds:4
      });

      setTimeout(
        ()=>finishGame(r),
        4000
      );

    },4000);

    return;
  }

  setTimeout(
    ()=>startRound(r),
    4000
  );
}
/* =========================================
   محرك محاكاة المباراة الواقعي والعادل
   ========================================= */

function average(arr){

  if(!arr||!arr.length){
    return 0;
  }

  return arr.reduce(
    (sum,value)=>sum+value,
    0
  )/arr.length;
}

function getPlayerById(id){

  return players.find(
    p=>p.id===id
  )||null;
}

function getTeamPlayers(teamIds){

  return teamIds
    .map(getPlayerById)
    .filter(Boolean);
}

/* الحصول على اللاعبين حسب المركز */

function positionPlayers(
  team,
  positions
){

  return team.filter(
    p=>positions.includes(p.position)
  );
}

function bestStatAverage(
  list,
  stat,
  fallback
){

  if(!list.length){
    return fallback;
  }

  return average(
    list.map(
      p=>p[stat]||fallback
    )
  );
}

/* =========================================
   تحليل قوة الفريق
   ========================================= */

function analyzeTeam(teamIds){

  const team=
    getTeamPlayers(teamIds);

  const goalkeepers=
    positionPlayers(
      team,
      ["GK"]
    );

  const defenders=
    positionPlayers(
      team,
      ["RB","CB","LB"]
    );

  const midfielders=
    positionPlayers(
      team,
      ["CDM","CM","AM"]
    );

  const attackers=
    positionPlayers(
      team,
      ["LW","RW","ST"]
    );

  const gk=
    goalkeepers
      .sort(
        (a,b)=>
          b.overall-a.overall
      )[0]||null;

  /* =========================
     حراسة المرمى
     ========================= */

  let goalkeeper=45;

  if(gk){

    goalkeeper=
      (
        gk.overall*0.65+
        gk.defending*0.20+
        gk.physical*0.10+
        gk.passing*0.05
      );
  }

  /* =========================
     الدفاع
     ========================= */

  let defense=0;

  if(defenders.length){

    defense=
      average(
        defenders.map(p=>
          p.defending*0.55+
          p.physical*0.20+
          p.pace*0.15+
          p.overall*0.10
        )
      );
  }else{

    defense=42;
  }

  /* =========================
     الوسط
     ========================= */

  let midfield=0;

  if(midfielders.length){

    midfield=
      average(
        midfielders.map(p=>
          p.passing*0.40+
          p.dribbling*0.20+
          p.stamina*0.15+
          p.defending*0.10+
          p.overall*0.15
        )
      );
  }else{

    midfield=42;
  }

  /* =========================
     الهجوم
     ========================= */

  let attack=0;

  if(attackers.length){

    attack=
      average(
        attackers.map(p=>
          p.shooting*0.42+
          p.pace*0.18+
          p.dribbling*0.18+
          p.physical*0.10+
          p.overall*0.12
        )
      );
  }else{

    attack=40;
  }

  /* =========================
     التقييم العام
     ========================= */

  const overall=
    average(
      team.map(
        p=>p.overall
      )
    );

  /* =========================
     تقييم التوازن

     وجود فريق مليان مهاجمين
     بدون دفاع أو حارس يعاقبه
     ========================= */

  let balance=100;

  if(goalkeepers.length===0){
    balance-=18;
  }

  if(defenders.length<3){
    balance-=
      (3-defenders.length)*7;
  }

  if(midfielders.length<2){
    balance-=
      (2-midfielders.length)*6;
  }

  if(attackers.length<2){
    balance-=
      (2-attackers.length)*4;
  }

  /*
    لو الفريق مليان مهاجمين
    بشكل غير طبيعي
  */

  if(attackers.length>5){

    balance-=
      (attackers.length-5)*3;
  }

  /*
    لو الفريق عنده حارسين
    أو عدد غير طبيعي
  */

  if(goalkeepers.length>2){

    balance-=
      (goalkeepers.length-2)*2;
  }

  balance=
    Math.max(
      45,
      Math.min(
        100,
        balance
      )
    );

  /*
    القوة النهائية

    الوسط له تأثير كبير
    لكن الهجوم والدفاع
    أهم في النتيجة
  */

  const power=
    (
      attack*0.29+
      midfield*0.24+
      defense*0.25+
      goalkeeper*0.14+
      overall*0.08
    )
    *
    (
      balance/100
    );

  return{

    team,

    goalkeeper,
    defense,
    midfield,
    attack,

    overall,

    balance,

    power,

    count:{
      goalkeepers:
        goalkeepers.length,

      defenders:
        defenders.length,

      midfielders:
        midfielders.length,

      attackers:
        attackers.length
    }
  };
}

/* =========================================
   مولد عشوائية طبيعية

   ليس Random لتحديد الفائز
   بل اختلاف طبيعي داخل المباراة
   ========================================= */

function normalRandom(){

  let u=0;
  let v=0;

  while(u===0){
    u=Math.random();
  }

  while(v===0){
    v=Math.random();
  }

  return Math.sqrt(
    -2*Math.log(u)
  )
  *
  Math.cos(
    2*Math.PI*v
  );
}

/* =========================================
   حساب أفضلية المباراة
   ========================================= */

function calculateMatchAdvantage(
  home,
  away
){

  /*
    هجوم الفريق
    ضد دفاع وحارس الخصم
  */

  const homeAttackVsDefense=
    home.attack-
    (
      away.defense*0.60+
      away.goalkeeper*0.40
    );

  const awayAttackVsDefense=
    away.attack-
    (
      home.defense*0.60+
      home.goalkeeper*0.40
    );

  /*
    معركة الوسط
  */

  const midfieldDifference=
    home.midfield-
    away.midfield;

  /*
    القوة الكلية
  */

  const powerDifference=
    home.power-
    away.power;

  /*
    التوازن
  */

  const balanceDifference=
    home.balance-
    away.balance;

  const homeAdvantage=
    homeAttackVsDefense*0.035+
    midfieldDifference*0.025+
    powerDifference*0.030+
    balanceDifference*0.010;

  const awayAdvantage=
    awayAttackVsDefense*0.035-
    midfieldDifference*0.025-
    powerDifference*0.030-
    balanceDifference*0.010;

  return{
    homeAdvantage,
    awayAdvantage,
    midfieldDifference,
    powerDifference
  };
}

/* =========================================
   حساب xG

   قوة الفريق هي الأساس
   والحظ عامل محدود فقط
   ========================================= */

function calculateXG(
  attackTeam,
  defenseTeam,
  isHome=false
){

  const advantage=
    (
      attackTeam.attack*0.45+
      attackTeam.midfield*0.25+
      attackTeam.power*0.15
    )
    -
    (
      defenseTeam.defense*0.40+
      defenseTeam.goalkeeper*0.30+
      defenseTeam.power*0.10
    );

  /*
    قيمة xG الأساسية
  */

  let xg=
    1.15+
    advantage*0.045;

  /*
    الفريق المتوازن
    يصنع فرصًا أفضل
  */

  xg+=
    (
      attackTeam.balance-
      defenseTeam.balance
    )
    *0.008;

  /*
    أفضلية بسيطة جدًا
    لصاحب الأرض
  */

  if(isHome){
    xg+=0.08;
  }

  /*
    اختلاف طبيعي صغير
    لا يحدد النتيجة
  */

  xg+=
    normalRandom()*0.16;

  /*
    منع الأرقام المجنونة
  */

  xg=
    Math.max(
      0.15,
      Math.min(
        4.20,
        xg
      )
    );

  return xg;
}

/* =========================================
   تحويل xG إلى أهداف

   توزيع Poisson
   ========================================= */

function poisson(lambda){

  const L=
    Math.exp(-lambda);

  let k=0;
  let p=1;

  do{

    k++;

    p*=
      Math.random();

  }while(p>L);

  return k-1;
}

/* =========================================
   منع النتائج غير المنطقية
   ========================================= */

function realisticGoals(
  goals,
  xg,
  strengthDifference
){

  /*
    في المباريات الطبيعية
    النتيجة لا يجب أن تكون
    8-0 كثيرًا
  */

  let maxGoals=6;

  if(xg<0.60){
    maxGoals=3;
  }

  if(xg<1.00){
    maxGoals=4;
  }

  if(
    strengthDifference>15
  ){
    maxGoals=7;
  }

  return Math.max(
    0,
    Math.min(
      maxGoals,
      goals
    )
  );
}

/* =========================================
   اختيار هدافي المباراة
   ========================================= */

function chooseScorer(
  team,
  minute
){

  const attacking=
    team.filter(
      p=>
        ["ST","LW","RW","AM","CM"]
          .includes(
            p.position
          )
    );

  if(!attacking.length){
    return null;
  }

  /*
    وزن اللاعب حسب
    التسديد + التقييم
  */

  const weights=
    attacking.map(
      p=>
        p.shooting*0.70+
        p.overall*0.30
    );

  const total=
    weights.reduce(
      (a,b)=>a+b,
      0
    );

  let random=
    Math.random()*total;

  for(
    let i=0;
    i<attacking.length;
    i++
  ){

    random-=weights[i];

    if(random<=0){

      return{
        player:attacking[i],
        minute
      };
    }
  }

  return{
    player:attacking[0],
    minute
  };
}

/* =========================================
   توزيع دقائق الأهداف
   ========================================= */

function generateGoalMinutes(
  goals,
  team
){

  const result=[];

  const minutes=[];

  for(
    let minute=3;
    minute<=90;
    minute++
  ){

    minutes.push(
      minute
    );
  }

  for(
    let i=0;
    i<goals;
    i++
  ){

    const index=
      Math.floor(
        Math.random()*
        minutes.length
      );

    const minute=
      minutes.splice(
        index,
        1
      )[0];

    result.push(
      chooseScorer(
        team,
        minute
      )
    );
  }

  return result
    .filter(Boolean)
    .sort(
      (a,b)=>
        a.minute-b.minute
    );
}

/* =========================================
   إنشاء ملخص أحداث المباراة
   ========================================= */

function createMatchEvents(
  homeGoals,
  awayGoals,
  homeTeam,
  awayTeam
){

  const homeEvents=
    generateGoalMinutes(
      homeGoals,
      homeTeam
    ).map(e=>({

      type:"goal",

      team:"home",

      minute:e.minute,

      player:e.player.name

    }));

  const awayEvents=
    generateGoalMinutes(
      awayGoals,
      awayTeam
    ).map(e=>({

      type:"goal",

      team:"away",

      minute:e.minute,

      player:e.player.name

    }));

  return[
    ...homeEvents,
    ...awayEvents
  ]
  .sort(
    (a,b)=>
      a.minute-b.minute
  );
}

/* =========================================
   المحاكاة الرئيسية للمباراة

   هذه الدالة هي الحكم النهائي
   ========================================= */

function simulateMatch(
  homeTeamIds,
  awayTeamIds
){

  const home=
    analyzeTeam(
      homeTeamIds
    );

  const away=
    analyzeTeam(
      awayTeamIds
    );

  const advantage=
    calculateMatchAdvantage(
      home,
      away
    );

  /*
    حساب الفرص المتوقعة
  */

  let homeXG=
    calculateXG(
      home,
      away,
      true
    );

  let awayXG=
    calculateXG(
      away,
      home,
      false
    );

  /*
    تعديل إضافي
    من قوة الهجوم
    ضد دفاع الخصم
  */

  homeXG+=
    advantage.homeAdvantage;

  awayXG+=
    advantage.awayAdvantage;

  homeXG=
    Math.max(
      0.10,
      Math.min(
        4.50,
        homeXG
      )
    );

  awayXG=
    Math.max(
      0.10,
      Math.min(
        4.50,
        awayXG
      )
    );

  /*
    تحويل xG إلى أهداف
  */

  let homeGoals=
    poisson(homeXG);

  let awayGoals=
    poisson(awayXG);

  /*
    فرق القوة
  */

  const strengthDifference=
    Math.abs(
      home.power-
      away.power
    );

  homeGoals=
    realisticGoals(
      homeGoals,
      homeXG,
      strengthDifference
    );

  awayGoals=
    realisticGoals(
      awayGoals,
      awayXG,
      strengthDifference
    );

  /*
    حماية إضافية:

    إذا كان الفرق كبيرًا جدًا
    لا نجعل الفريق الأضعف
    يفوز كثيرًا بشكل غير منطقي.

    المفاجأة ممكنة،
    لكنها نادرة.
  */

  const strongerHome=
    home.power>
    away.power;

  const stronger=
    strongerHome
      ?home
      :away;

  const weaker=
    strongerHome
      ?away
      :home;

  const strongerGoals=
    strongerHome
      ?homeGoals
      :awayGoals;

  const weakerGoals=
    strongerHome
      ?awayGoals
      :homeGoals;

  if(
    strengthDifference>=18&&
    weakerGoals>
    strongerGoals
  ){

    /*
      85% من الوقت
      يتم تصحيح الفوز
      غير المنطقي للفريق الأضعف
    */

    if(Math.random()<0.85){

      if(strongerHome){

        homeGoals=
          Math.max(
            homeGoals,
            awayGoals
          );

      }else{

        awayGoals=
          Math.max(
            awayGoals,
            homeGoals
          );
      }
    }
  }

  /*
    إذا كان الفريقان متقاربين
    فالنتيجة تظل مفتوحة
    ولا يوجد تصحيح.
  */

  const events=
    createMatchEvents(
      homeGoals,
      awayGoals,
      home.team,
      away.team
    );

  /*
    استحواذ تقريبي
    مبني على الوسط
  */

  const midfieldTotal=
    home.midfield+
    away.midfield;

  let homePossession=
    midfieldTotal>0
      ?(
        home.midfield/
        midfieldTotal
      )*100
      :50;

  homePossession+=
    normalRandom()*2;

  homePossession=
    Math.max(
      35,
      Math.min(
        65,
        homePossession
      )
    );

  const awayPossession=
    100-homePossession;

  /*
    عدد التسديدات
    مرتبط بـ xG والهجوم
  */

  const homeShots=
    Math.max(
      homeGoals,
      Math.round(
        homeXG*5+
        Math.random()*4
      )
    );

  const awayShots=
    Math.max(
      awayGoals,
      Math.round(
        awayXG*5+
        Math.random()*4
      )
    );

  return{

    score:{
      home:homeGoals,
      away:awayGoals
    },

    xg:{
      home:
        Number(
          homeXG.toFixed(2)
        ),

      away:
        Number(
          awayXG.toFixed(2)
        )
    },

    possession:{
      home:
        Number(
          homePossession.toFixed(1)
        ),

      away:
        Number(
          awayPossession.toFixed(1)
        )
    },

    shots:{
      home:homeShots,
      away:awayShots
    },

    events,

    analysis:{

      home:{
        attack:
          Number(
            home.attack.toFixed(1)
          ),

        midfield:
          Number(
            home.midfield.toFixed(1)
          ),

        defense:
          Number(
            home.defense.toFixed(1)
          ),

        goalkeeper:
          Number(
            home.goalkeeper.toFixed(1)
          ),

        balance:
          Number(
            home.balance.toFixed(1)
          ),

        power:
          Number(
            home.power.toFixed(1)
          )
      },

      away:{
        attack:
          Number(
            away.attack.toFixed(1)
          ),

        midfield:
          Number(
            away.midfield.toFixed(1)
          ),

        defense:
          Number(
            away.defense.toFixed(1)
          ),

        goalkeeper:
          Number(
            away.goalkeeper.toFixed(1)
          ),

        balance:
          Number(
            away.balance.toFixed(1)
          ),

        power:
          Number(
            away.power.toFixed(1)
          )
      }
    }
  };
}

/* =========================================
   إنهاء اللعبة وتحديد النتيجة
   ========================================= */

function finishGame(r){

  if(
    r.phase==="finished"
  ){
    return;
  }

  clearTimeout(
    r.timer
  );

  r.phase=
    "result";

  const ids=
    [...r.players.keys()];

  if(ids.length<2){
    return;
  }

  const homeId=
    ids[0];

  const awayId=
    ids[1];

  const home=
    r.players.get(
      homeId
    );

  const away=
    r.players.get(
      awayId
    );

  /*
    محاكاة المباراة
    من قوة الفريقين
  */

  const match=
    simulateMatch(
      home.team,
      away.team
    );

  const homeScore=
    match.score.home;

  const awayScore=
    match.score.away;

  let winnerId=null;

  if(
    homeScore>
    awayScore
  ){

    winnerId=
      homeId;

  }else if(
    awayScore>
    homeScore
  ){

    winnerId=
      awayId;
  }

  /*
    تحديث البروفايلات
  */

  const homeProfile=
    touchProfile(home);

  const awayProfile=
    touchProfile(away);

  homeProfile.matches++;
  awayProfile.matches++;

  if(
    winnerId===homeId
  ){

    homeProfile.wins++;
    homeProfile.points+=3;

    awayProfile.losses++;

  }else if(
    winnerId===awayId
  ){

    awayProfile.wins++;
    awayProfile.points+=3;

    homeProfile.losses++;

  }else{

    homeProfile.draws++;
    awayProfile.draws++;

    homeProfile.points++;
    awayProfile.points++;
  }

  saveProfiles();

  /*
    ترتيب اللاعبين
  */

  const ranking=
    leaderboard();

  /*
    إرسال النتيجة
  */

  broadcast(r,{

    type:"matchResult",

    result:{

      home:{
        id:homeId,
        name:home.name,
        photo:home.photo||"",
        team:
          getTeamPlayers(
            home.team
          )
      },

      away:{
        id:awayId,
        name:away.name,
        photo:away.photo||"",
        team:
          getTeamPlayers(
            away.team
          )
      },

      score:{
        home:homeScore,
        away:awayScore
      },

      winnerId,

      xg:match.xg,

      possession:
        match.possession,

      shots:
        match.shots,

      events:
        match.events,

      analysis:
        match.analysis,

      ranking
    }
  });

  /*
    الحالة النهائية
    تظل موجودة حتى لو
    أحد اللاعبين خرج
  */

  r.phase=
    "finished";

  r.finishedAt=
    Date.now();

  /*
    نحتفظ بالغرفة فترة
    حتى يظل اللاعب الآخر
    يشاهد النتيجة
  */

  setTimeout(()=>{

    if(
      r.phase==="finished"
    ){

      rooms.delete(
        r.code
      );

      broadcastRooms();
    }

  },10*60*1000);
}
/* =========================================
   WebSocket - إدارة الاتصال واللاعبين
   ========================================= */
const wss = new WebSocket.WebSocketServer({
  server: server
});
function getProfile(playerId){

  if(!profiles[playerId]){

    profiles[playerId]={
      name:"لاعب",
      photo:"",
      matches:0,
      wins:0,
      losses:0,
      draws:0,
      points:0
    };

  }

  return profiles[playerId];

}

wss.on("connection",(ws)=>{

  ws.playerId=null;
  ws.roomCode=null;
  ws.playerName="لاعب";
  ws.playerPhoto="";

  /*
    إرسال قائمة الغرف فور الاتصال
  */

  send(ws,{
    type:"roomsList",
    rooms:getPublicRooms()
  });


  /* =========================================
     استقبال الرسائل
     ========================================= */

  ws.on("message",(message)=>{

    let data;

    try{

      data=
        JSON.parse(
          message.toString()
        );

    }catch(error){

      send(ws,{
        type:"error",
        message:"البيانات غير صحيحة"
      });

      return;
    }


    /* =========================================
       تسجيل اللاعب
       ========================================= */

    if(
      data.type==="login"
    ){

      ws.playerId=
        data.playerId||
        randomId();

      ws.playerName=
        data.name||
        "لاعب";

      ws.playerPhoto=
        data.photo||
        "";

      const profile=
        getProfile(
          ws.playerId
        );

      if(data.name){

        profile.name=
          data.name;
      }

      if(data.photo){

        profile.photo=
          data.photo;
      }

      saveProfiles();

      send(ws,{
        type:"loginSuccess",

        playerId:
          ws.playerId,

        profile:
          touchProfile({
            id:ws.playerId,
            name:ws.playerName,
            photo:ws.playerPhoto
          }),

        ranking:
          leaderboard()
      });

      return;
    }


    /* =========================================
       طلب الملف الشخصي
       ========================================= */

    if(
      data.type==="getProfile"
    ){

      const profile=
        touchProfile({
          id:ws.playerId,
          name:ws.playerName,
          photo:ws.playerPhoto
        });

      send(ws,{
        type:"profile",
        profile
      });

      return;
    }


    /* =========================================
       طلب ترتيب اللاعبين
       ========================================= */

    if(
      data.type==="getLeaderboard"
    ){

      send(ws,{
        type:"leaderboard",
        ranking:
          leaderboard()
      });

      return;
    }


    /* =========================================
       إنشاء غرفة
       ========================================= */

    if(
      data.type==="createRoom"
    ){

      if(!ws.playerId){

        send(ws,{
          type:"error",
          message:"يجب تسجيل الدخول أولاً"
        });

        return;
      }


      /*
        نوع الغرفة

        eleven = 11 لاعب
        five = 5 لاعبين
      */

  const roomType=
  data.roomType==="five"
    ?"five"
    :"eleven";


      /*
        11 لاعب = 200 مليون

        خماسي = 100 مليون
      */

      const budget=
        roomType==="five"
          ?100
          :200;


      /*
        عدد الجولات

        خماسي = 5 جولات

        11 لاعب = 11 جولة
      */

      const totalRounds=
        roomType==="five"
          ?5
          :11;


      const code=
        generateRoomCode();


      const room={

        code,

        ownerId:
          ws.playerId,

        roomType,

        budget,

        totalRounds,

        round:0,

        phase:"waiting",

        currentPlayer:null,

        currentPrice:0,

        currentBidder:null,

        bidHistory:[],

        players:
          new Map(),

        timer:null,

        turnStartedAt:null,

        result:null,

        createdAt:
          Date.now()
      };


      room.players.set(
        ws.playerId,
        {

          id:
            ws.playerId,

          name:
            ws.playerName,

          photo:
            ws.playerPhoto,

          ws,

          money:
            budget,

          team:[],

          ready:false
        }
      );


      rooms.set(
        code,
        room
      );


      ws.roomCode=
        code;


      send(ws,{
        type:"roomCreated",

        room:
          getRoomData(
            room,
            ws.playerId
          )
      });


      /*
        تحديث الغرف
        حتى تظهر للجميع
      */

      broadcastRooms();

      return;
    }


    /* =========================================
       دخول الغرفة مباشرة من قائمة الغرف
       ========================================= */

   if(
  data.type==="join"
){

  const code=
    data.room;

      const room=
        rooms.get(
          code
        );


      if(!room){

        send(ws,{
          type:"error",
          message:"الغرفة لم تعد متاحة"
        });

        return;
      }


      /*
        لا دخول أثناء المباراة
      */

      if(
        room.phase!=="waiting"
      ){

        send(ws,{
          type:"error",
          message:"المباراة بدأت بالفعل"
        });

        return;
      }


      /*
        الغرفة ممتلئة
      */

      if(
        room.players.size>=2
      ){

        send(ws,{
          type:"error",
          message:"الغرفة ممتلئة"
        });

        return;
      }


      /*
        منع دخول نفس اللاعب مرتين
      */

      if(
        room.players.has(
          ws.playerId
        )
      ){

        send(ws,{
          type:"roomJoined",

          room:
            getRoomData(
              room,
              ws.playerId
            )
        });

        return;
      }


      room.players.set(
        ws.playerId,
        {

          id:
            ws.playerId,

          name:
            ws.playerName,

          photo:
            ws.playerPhoto,

          ws,

          money:
            room.budget,

          team:[],

          ready:false
        }
      );


      ws.roomCode=
        room.code;


      /*
        دخول مباشر بدون كتابة كود
      */

      broadcast(room,{

        type:"roomUpdate",

        room:
          getRoomData(
            room
          )
      });


      broadcastRooms();

      return;
    }


    /* =========================================
       اللاعب جاهز
       ========================================= */

    if(
      data.type==="ready"
    ){

      const room=
        rooms.get(
          ws.roomCode
        );

      if(!room){
        return;
      }


      const player=
        room.players.get(
          ws.playerId
        );

      if(!player){
        return;
      }


      player.ready=true;


      broadcast(room,{

        type:"roomUpdate",

        room:
          getRoomData(
            room
          )
      });


      /*
        بدء اللعبة
        عندما يكون لاعبان جاهزين
      */

      if(
        room.players.size===2&&
        [...room.players.values()]
          .every(
            p=>p.ready
          )
      ){

        startGame(
          room
        );
      }

      return;
    }

     if (
  data.type === "start"
) {

  const room =
    rooms.get(
      ws.roomCode
    );

  if (!room) {

    send(ws, {
      type: "error",
      message: "الغرفة غير موجودة"
    });

    return;
  }

  if (
    room.ownerId !== ws.playerId
  ) {

    send(ws, {
      type: "error",
      message: "صاحب الغرفة فقط يمكنه بدء المزاد"
    });

    return;
  }

  if (
    room.players.size !== 2
  ) {

    send(ws, {
      type: "error",
      message: "يجب دخول لاعبين قبل بدء المزاد"
    });

    return;
  }

  startGame(room);

  return;
}

    /* =========================================
       المزايدة
       
       مهم جداً:
       
       الرقم المدخل هو السعر النهائي.
       
       لا يتم جمعه على المزايدة السابقة.
       
       مثال:
       السعر الحالي = 14
       اللاعب الآخر يجب أن يضع 15 أو أكثر.
       
       15 يصبح السعر النهائي.
       
       وليس 14 + 15 = 29.
       ========================================= */

    if(
      data.type==="bid"
    ){

      const room=
        rooms.get(
          ws.roomCode
        );

      if(!room){
        return;
      }


      if(
        room.phase!=="bidding"
      ){

        send(ws,{
          type:"error",
          message:"لا توجد مزايدة حالياً"
        });

        return;
      }


      const player=
        room.players.get(
          ws.playerId
        );

      if(!player){
        return;
      }


      /*
        اللاعب بدون فلوس
        لا يحق له المزايدة
      */

      if(
        player.money<=0
      ){

        send(ws,{
          type:"error",
          message:"لا تملك أموالاً للمزايدة"
        });

        return;
      }


      const amount=
        Number(
          data.amount
        );


      if(
        !Number.isFinite(
          amount
        )
      ){

        send(ws,{
          type:"error",
          message:"أدخل رقماً صحيحاً"
        });

        return;
      }


      /*
        السعر النهائي يجب
        أن يكون أكبر من السعر الحالي
      */

      if(
        amount<=
        room.currentPrice
      ){

        send(ws,{
          type:"error",

          message:
            `يجب أن تكون المزايدة أكبر من ${room.currentPrice}`
        });

        return;
      }


      /*
        لا يستطيع دفع مبلغ
        أكبر من أمواله
      */

      if(
        amount>
        player.money
      ){

        send(ws,{
          type:"error",
          message:"لا تملك هذا المبلغ"
        });

        return;
      }


      /*
        السعر الحالي يصبح
        المبلغ الجديد مباشرة.

        لا يوجد جمع.
      */

      room.currentPrice=
        amount;

      room.currentBidder=
        ws.playerId;


      room.bidHistory.push({

        playerId:
          ws.playerId,

        amount,

        time:
          Date.now()
      });


      /*
        إرسال تحديث للجميع
      */

      broadcast(room,{

        type:"bidUpdate",

        room:
          getRoomData(
            room
          ),

        currentPrice:
          room.currentPrice,

        currentBidder:
          room.currentBidder,

        nextMinimumBid:
          room.currentPrice+1
      });


      return;
    }


    /* =========================================
       تمرير المزايدة
       ========================================= */

    if(
      data.type==="passBid"
    ){

      const room=
        rooms.get(
          ws.roomCode
        );

      if(
        !room||
        room.phase!=="bidding"
      ){
        return;
      }


      /*
        لا يمكن تمرير المزاد
        قبل وجود مزايدة
      */

      if(
        !room.currentBidder
      ){

        return;
      }


      /*
        اللاعب الفائز
        بالمزايدة الحالية
      */

      const winner=
        room.players.get(
          room.currentBidder
        );


      if(!winner){
        return;
      }


      /*
        اللاعب يدفع السعر النهائي فقط
      */

      winner.money-=
        room.currentPrice;


      /*
        إضافة اللاعب للفريق
      */

      winner.team.push(
        room.currentPlayer.id
      );


      const soldPlayer=
        room.currentPlayer;


      broadcast(room,{

        type:"playerSold",

        player:
          soldPlayer,

        winnerId:
          winner.id,

        winnerName:
          winner.name,

        finalPrice:
          room.currentPrice
      });


      /*
        الانتقال للجولة التالية
      */

      setTimeout(()=>{

        nextRound(
          room
        );

      },1500);


      return;
    }

  });


  /* =========================================
     خروج اللاعب من الاتصال
     ========================================= */

  ws.on("close",()=>{

    const room=
      rooms.get(
        ws.roomCode
      );


    if(!room){
      return;
    }


    /*
      إذا انتهت المباراة بالفعل

      خروج لاعب من شاشة النتيجة
      لا يؤثر على اللاعب الآخر.
    */

    if(
      room.phase==="finished"||
      room.phase==="result"
    ){

      const player=
        room.players.get(
          ws.playerId
        );

      if(player){

        player.ws=null;
      }

      return;
    }


    /*
      أثناء الانتظار أو الجولات:
      إبلاغ الخصم
      أن اللاعب غادر
    */

    room.players.delete(
      ws.playerId
    );


    clearTimeout(
      room.timer
    );


    /*
      إذا بقي لاعب آخر
    */

    if(
      room.players.size>0
    ){

      broadcast(room,{

        type:"opponentLeft",

        message:
          "لقد غادر خصمك الغرفة"
      });


      /*
        حذف الغرفة بعد فترة قصيرة
      */

      setTimeout(()=>{

        if(
          rooms.has(
            room.code
          )
        ){

          rooms.delete(
            room.code
          );

          broadcastRooms();
        }

      },30000);

    }else{

      /*
        لا يوجد أي لاعب
      */

      rooms.delete(
        room.code
      );

      broadcastRooms();
    }


    /*
      إذا كان في مزايدة
      تتوقف فوراً
    */

    room.phase=
      "cancelled";


    broadcastRooms();
  });

});


/* =========================================
   بدء اللعبة
   ========================================= */

function startGame(room){

  room.phase=
    "starting";

  room.round=0;

   room.currentTurn = null;


  /*
    توزيع اللاعبين يكون عشوائياً
    ولا يعتمد على قوة اللاعب فقط.
  */

  room.availablePlayers=
    shuffle(
      [...players]
    );


  broadcast(room,{

    type:"gameStarted",

    room:
      getRoomData(
        room
      )
  });


  setTimeout(()=>{

    nextRound(
      room
    );

  },1000);
}


/* =========================================
   الجولة التالية
   ========================================= */

function nextRound(room){

  /*
    التأكد أن الغرفة ما زالت موجودة
  */

  if(
    !rooms.has(
      room.code
    )
  ){
    return;
  }


  /*
    إذا خرج لاعب
  */

  if(
    room.players.size<2
  ){
    return;
  }


  /*
    نهاية الجولات
  */

  if(
    room.round>=
    room.totalRounds
  ){

    room.phase=
      "playing";

    broadcast(room,{

      type:"auctionFinished",

      room:
        getRoomData(
          room
        )
    });


    /*
      محاكاة المباراة
    */

    setTimeout(()=>{

      finishGame(
        room
      );

    },1500);

    return;
  }


  room.round++;


  /*
    اختيار لاعب عشوائي
    من القائمة الكبيرة.

    ليس شرطاً أن يكون مشهوراً
    أو قوياً.
  */

  const currentPlayer=
    getRandomAuctionPlayer(
      room
    );


  room.currentPlayer=
    currentPlayer;

  room.currentPrice=0;

  room.currentBidder=null;

  room.bidHistory=[];

  room.phase=
    "bidding";
   /*
  تحديد اللاعب الذي يبدأ الجولة
*/

const playerIds =
  [...room.players.keys()];


/*
  تبديل اللاعب الذي يبدأ
  في كل جولة
*/

if (
  !room.currentTurn
) {

  room.currentTurn =
    playerIds[0];

} else {

  const currentIndex =
    playerIds.indexOf(
      room.currentTurn
    );

  room.currentTurn =
    playerIds[
      (currentIndex + 1) %
      playerIds.length
    ];
}


  /*
    حساب اللاعبين الذين
    لديهم فلوس للمزايدة
  */

  const activePlayers=
    [...room.players.values()]
      .filter(
        p=>p.money>0
      );


  /*
    لو لاعب واحد فقط
    معه فلوس، يحصل على اللاعب
    تلقائياً بالسعر 0
    أو السعر الابتدائي
  */

  if(
    activePlayers.length===1
  ){

    const winner=
      activePlayers[0];


    winner.team.push(
      currentPlayer.id
    );


    broadcast(room,{

      type:"playerSold",

      player:
        currentPlayer,

      winnerId:
        winner.id,

      winnerName:
        winner.name,

      finalPrice:0
    });


    setTimeout(()=>{

      nextRound(
        room
      );

    },1000);

    return;
  }


  /*
    إرسال بداية الجولة
  */

  broadcast(room,{

    type:"newRound",

    round:
      room.round,

    totalRounds:
      room.totalRounds,

    player:
      currentPlayer,
     currentTurn:
  room.currentTurn,

    room:
      getRoomData(
        room
      ),

    currentPrice:0,

    nextMinimumBid:1
  });


  /*
    مؤقت الجولة
  */

  clearTimeout(
    room.timer
  );


  room.timer=
    setTimeout(()=>{

      /*
        إذا لم يزايد أحد
        يتم تخطي اللاعب
      */

      if(
        !room.currentBidder
      ){

        nextRound(
          room
        );

        return;
      }


      const winner=
        room.players.get(
          room.currentBidder
        );


      if(winner){

        winner.money-=
          room.currentPrice;

        winner.team.push(
          room.currentPlayer.id
        );


        broadcast(room,{

          type:"playerSold",

          player:
            room.currentPlayer,

          winnerId:
            winner.id,

          winnerName:
            winner.name,

          finalPrice:
            room.currentPrice
        });
      }


      setTimeout(()=>{

        nextRound(
          room
        );

      },1000);


    },30000);
}


/* =========================================
   اختيار لاعب للمزاد

   توزيع متنوع فعلاً:

   - نجوم
   - لاعبين متوسطين
   - لاعبين ضعاف
   - لاعبين عاديين
   ========================================= */

function getRandomAuctionPlayer(room){

  /*
    إزالة اللاعبين الذين ظهروا
    بالفعل في هذه الغرفة
  */

  const usedPlayers=
    new Set();

  room.players.forEach(
    player=>{

      player.team.forEach(
        id=>usedPlayers.add(id)
      );

    }
  );


  let available=
    players.filter(
      p=>
        !usedPlayers.has(
          p.id
        )
    );


  /*
    في حالة نفاد القائمة
  */

  if(!available.length){

    available=
      [...players];
  }


  /*
    تصنيف اللاعبين
    حسب القوة
  */

  const weak=
    available.filter(
      p=>p.overall<70
    );

  const medium=
    available.filter(
      p=>
        p.overall>=70&&
        p.overall<80
    );

  const strong=
    available.filter(
      p=>
        p.overall>=80&&
        p.overall<87
    );

  const stars=
    available.filter(
      p=>p.overall>=87
    );


  /*
    توزيع الاحتمالات:

    35% ضعاف
    35% متوسطون
    20% أقوياء
    10% نجوم

    وبالتالي لن تكون اللعبة
    مليئة بالنجوم فقط.
  */

  const random=
    Math.random();


  let pool;


  if(
    random<0.35&&
    weak.length
  ){

    pool=weak;

  }else if(
    random<0.70&&
    medium.length
  ){

    pool=medium;

  }else if(
    random<0.90&&
    strong.length
  ){

    pool=strong;

  }else if(
    stars.length
  ){

    pool=stars;

  }else{

    pool=available;
  }


  return pool[
    Math.floor(
      Math.random()*
      pool.length
    )
  ];
}


/* =========================================
   إرجاع بيانات الغرفة
   ========================================= */

function getRoomData(
  room,
  viewerId=null
){

  return{

    code:
      room.code,

    ownerId:
      room.ownerId,

    roomType:
      room.roomType,

    budget:
      room.budget,

    totalRounds:
      room.totalRounds,

    round:
      room.round,

    phase:
      room.phase,

    currentPlayer:
      room.currentPlayer,

    currentPrice:
      room.currentPrice,

    currentBidder:
      room.currentBidder,

    nextMinimumBid:
      room.currentPrice+1,

    players:
      [...room.players.values()]
        .map(p=>({

          id:p.id,

          name:p.name,

          photo:p.photo,

          money:p.money,

          team:p.team,

          teamPlayers:
            getTeamPlayers(
              p.team
            ),

          ready:p.ready,

          isMe:
            p.id===viewerId
        }))
  };
}


/* =========================================
   الغرف المتاحة في الصفحة الرئيسية
   ========================================= */

function getPublicRooms(){

  const result=[];


  rooms.forEach(
    room=>{

      /*
        عرض غرف الانتظار فقط
      */

      if(
        room.phase!=="waiting"
      ){
        return;
      }


      const owner=
        room.players.get(
          room.ownerId
        );


      result.push({

        code:
          room.code,

        ownerName:
          owner
            ?owner.name
            :"لاعب",

        ownerPhoto:
          owner
            ?owner.photo
            :"",

        roomType:
          room.roomType,

        budget:
          room.budget,

        totalRounds:
          room.totalRounds,

        playersCount:
          room.players.size,

        maxPlayers:2,

        createdAt:
          room.createdAt
      });

    }
  );


  return result;
}


/* =========================================
   تحديث قائمة الغرف للجميع
   ========================================= */

function broadcastRooms(){

  const roomsList=
    getPublicRooms();


  wss.clients.forEach(
    client=>{

      if(
        client.readyState===
        WebSocket.OPEN
      ){

        send(client,{

          type:"roomsList",

          rooms:
            roomsList
        });
      }

    }
  );
}


/* =========================================
   إرسال رسالة للاعب
   ========================================= */

function send(ws,data){

  if(
    !ws||
    ws.readyState!==
    WebSocket.OPEN
  ){
    return;
  }


  ws.send(
    JSON.stringify(
      data
    )
  );
}


/* =========================================
   إرسال للجميع داخل الغرفة
   ========================================= */

function broadcast(room,data){

  room.players.forEach(
    player=>{

      if(
        player.ws&&
        player.ws.readyState===
        WebSocket.OPEN
      ){

        send(
          player.ws,
          data
        );
      }

    }
  );
}


/* =========================================
   توليد كود الغرفة
   ========================================= */

function generateRoomCode(){

  let code;

  do{

    code=
      Math.random()
        .toString(36)
        .substring(2,8)
        .toUpperCase();

  }while(
    rooms.has(
      code
    )
  );

  return code;
}


/* =========================================
   ID عشوائي للاعب
   ========================================= */

function randomId(){

  return(
    Date.now()
      .toString(36)
    +
    Math.random()
      .toString(36)
      .substring(2,9)
  );
}


/* =========================================
   Shuffle
   ========================================= */

function shuffle(array){

  const copy=
    [...array];


  for(
    let i=
      copy.length-1;
    i>0;
    i--
  ){

    const j=
      Math.floor(
        Math.random()*
        (i+1)
      );


    [
      copy[i],
      copy[j]
    ]=
    [
      copy[j],
      copy[i]
    ];
  }


  return copy;
}


/* =========================================
   تنظيف الغرف القديمة
   ========================================= */

setInterval(()=>{

  const now=
    Date.now();


  rooms.forEach(
    room=>{

      /*
        الغرف المنتظرة القديمة
      */

      if(
        room.phase==="waiting"&&
        now-room.createdAt>
        60*60*1000
      ){

        rooms.delete(
          room.code
        );
      }


      /*
        الغرف الملغية
      */

      if(
        room.phase==="cancelled"
      ){

        rooms.delete(
          room.code
        );
      }

    }
  );


  broadcastRooms();


},60000);


/* =========================================
   تشغيل السيرفر
   ========================================= */

server.listen(PORT,()=>{

  console.log(
    "================================="
  );

  console.log(
    "Football Auction Server Running"
  );

  console.log(
    `Port: ${PORT}`
  );

  console.log(
    "================================="
  );

});
