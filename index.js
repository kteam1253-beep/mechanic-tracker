'use strict';
require('dotenv').config();
const {createStorage} = require('./storage');
const {addPlayerRepair, migratePlayers, playerTotals, rankingLines} = require('./players');
const path = require('node:path');
const {Client, GatewayIntentBits, Events, SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, StringSelectMenuBuilder, MessageFlags} = require('discord.js');

const {DISCORD_TOKEN, CLIENT_ID, GUILD_ID, CHANNEL_ID, LOG_CHANNEL_ID} = process.env;
for (const k of ['DISCORD_TOKEN','CLIENT_ID','GUILD_ID','CHANNEL_ID']) if (!process.env[k]) { console.error(`Nedostaje ${k} u .env`); process.exit(1); }
const FILE = path.join(__dirname, 'data.json');
const ZONE = 'Europe/Zagreb';
function localDate(d=new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
  const p = Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function weekKey(d=new Date()) {
  const [y,m,day]=localDate(d).split('-').map(Number);
  const utc=new Date(Date.UTC(y,m-1,day));
  const offset=(utc.getUTCDay()+6)%7;
  utc.setUTCDate(utc.getUTCDate()-offset);
  return utc.toISOString().slice(0,10);
}
function displayDate(isoDate){const [year,month,day]=isoDate.split('-');return `${day}.${month}.${year}.`;}
function defaults(){return {version:1,week:weekKey(),roles:[],messageId:null,channelId:CHANNEL_ID,weekly:{},lifetime:{},history:{},audit:[]};}
let db, storage;
async function save(){
 try { await storage.save(db); }
 catch { console.error('Spremanje nije uspjelo. Provjeri MySQL i pokreni samo jednu repliku.'); client.destroy(); process.exit(1); }
}
function record(type,user,details){db.audit.push({at:new Date().toISOString(),type,user,details});if(db.audit.length>2000)db.audit=db.audit.slice(-2000);}
function count(obj){return Object.values(obj).reduce((a,b)=>a+b,0);}
const client=new Client({intents:[GatewayIntentBits.Guilds]});
const commands=[
 new SlashCommandBuilder().setName('uloge').setDescription('Odaberi uloge koje smiju resetirati popravke').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
 new SlashCommandBuilder().setName('postavi').setDescription('Postavi ili obnovi stalnu live poruku').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
 new SlashCommandBuilder().setName('status').setDescription('Prikaži postavke i statistiku bota'),
].map(c=>c.toJSON());
function controls(){return [new ActionRowBuilder().addComponents(
 new ButtonBuilder().setCustomId('repair:add').setLabel('Dodaj popravku').setEmoji('➕').setStyle(ButtonStyle.Success),
 new ButtonBuilder().setCustomId('repair:reset').setLabel('Resetiraj popravku').setEmoji('↩️').setStyle(ButtonStyle.Danger))];}
function display(){
 const badges=rankingLines(Object.entries(db.weekly),(badge,n)=>`👮 **${badge}** — **${n}**`,'Još nema popravaka.');
 const totals=playerTotals(db);
 const unknown=count(db.weekly)-count(totals);
 const players=rankingLines(Object.entries(totals),(user,n)=>`🔧 <@${user}> — **${n}**`,'Još nema evidentiranih igrača.');
 return {allowedMentions:{parse:[]},embeds:[new EmbedBuilder().setColor(0x80aaff).setTitle('🚔 POLICIJA | EVIDENCIJA POPRAVAKA')
  .setDescription(`Pregled popravaka po policijskim značkama i igračima koji su ih unijeli.\n\n**Evidencija od ${displayDate(db.week)}**`)
  .addFields(
   {name:'Značka — Popravaka',value:badges,inline:true},
   {name:'Igrač — Popravaka',value:players,inline:true},
   {name:'Ukupno od zadnjeg reseta',value:`**${count(db.weekly)}**`+(unknown>0?`\nZa **${unknown}** starijih popravaka igrač nije poznat.`:''),inline:false})
  .setFooter({text:'Resetiranje samo ručno • Automatsko ažuriranje nakon svake promjene • Europe/Zagreb'})],components:controls()};
}
async function getChannel(){const channel=await client.channels.fetch(db.channelId||CHANNEL_ID);if(!channel?.isTextBased()||!channel.send)throw Error('CHANNEL_ID nije tekstualni kanal');return channel;}
async function updatePanel(){const channel=await getChannel();let msg=null;if(db.messageId){try{msg=await channel.messages.fetch(db.messageId);}catch{}}
 if(msg){await msg.edit(display());}else{msg=await channel.send(display());db.messageId=msg.id;await save();}return msg;}
async function auditToChannel(text){if(!LOG_CHANNEL_ID)return;try{const c=await client.channels.fetch(LOG_CHANNEL_ID);if(c?.isTextBased())await c.send({content:text.slice(0,1900)});}catch(e){console.error('Log kanal:',e.message);}}
function canReset(i){return i.memberPermissions?.has(PermissionFlagsBits.Administrator)||db.roles.some(r=>i.member?.roles?.cache?.has(r)||Array.isArray(i.member?.roles)&&i.member.roles.includes(r));}
function addModal(){return new ModalBuilder().setCustomId('repair:add:submit').setTitle('Dodaj popravke').addComponents(
 new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('badge').setLabel('Policijska značka').setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(20).setRequired(true).setPlaceholder('125')),
 new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('Broj novih popravaka').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('3')));
}
function resetModal(mode){return new ModalBuilder().setCustomId(`repair:reset:confirm:${mode}`).setTitle(mode==='all'?'Potvrda resetiranja svih':'Potvrda resetiranja značke').addComponents(
 new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('confirmation').setLabel(mode==='all'?'Upiši RESET SVE':'Upiši RESET').setPlaceholder(mode==='all'?'RESET SVE':'RESET').setStyle(TextInputStyle.Short).setRequired(true)));
}
async function safeReply(i,content){if(i.deferred&&!i.replied)await i.editReply({content});else if(i.replied)await i.followUp({content,flags:MessageFlags.Ephemeral});else await i.reply({content,flags:MessageFlags.Ephemeral});}
client.once(Events.ClientReady,async()=>{console.log(`Prijavljen kao ${client.user.tag}`);
 try{const guild=await client.guilds.fetch(GUILD_ID);await guild.commands.set(commands);console.log('Komande registrirane.');await updatePanel();}catch(e){console.error('Pokretanje:',e);}
});
client.on(Events.InteractionCreate,async i=>{try{
 if(i.guildId!==GUILD_ID)return;
 if(i.isChatInputCommand()){
  if(i.commandName==='uloge'){
   if(!i.memberPermissions.has(PermissionFlagsBits.Administrator))return safeReply(i,'Samo administrator može mijenjati uloge.');
   await i.deferReply({flags:MessageFlags.Ephemeral});
   const roles=(await i.guild.roles.fetch()).filter(r=>r.id!==i.guild.id&&!r.managed).sort((a,b)=>b.position-a.position).first(25);
   if(!roles.length)return await safeReply(i,'Nema dostupnih uloga.');
   const menu=new StringSelectMenuBuilder().setCustomId('repair:roles').setPlaceholder('Odaberi uloge za resetiranje').setMinValues(1).setMaxValues(Math.min(10,roles.length));
   menu.addOptions(roles.map(r=>({label:r.name.slice(0,100),value:r.id,default:db.roles.includes(r.id)})));
   return await i.editReply({content:`**Uloge koje smiju resetirati:** ${db.roles.length?db.roles.map(r=>`<@&${r}>`).join(', '):'nijedna (osim administratora)'}\nOdaberi jednu ili više uloga (zamjenjuje prethodni izbor).`,components:[new ActionRowBuilder().addComponents(menu)]});
  }
  if(i.commandName==='postavi'){
   if(!i.memberPermissions.has(PermissionFlagsBits.Administrator))return safeReply(i,'Samo administrator može postaviti poruku.');
   await i.deferReply({flags:MessageFlags.Ephemeral});const m=await updatePanel();return i.editReply(`Live poruka spremna: ${m.url}`);
  }
  if(i.commandName==='status')return safeReply(i,`Popravaka od zadnjeg reseta: **${count(db.weekly)}**\nUkupno svih vremena: **${count(db.lifetime)}**\nUloge za reset: ${db.roles.length?db.roles.map(r=>`<@&${r}>`).join(', '):'samo administratori'}`);
 }
 if(i.isStringSelectMenu()&&i.customId==='repair:roles'){
  if(!i.memberPermissions.has(PermissionFlagsBits.Administrator))return safeReply(i,'Nemaš dozvolu.');
  db.roles=i.values;record('SET_ROLES',i.user.id,i.values.join(','));await save();return i.update({content:`Spremljeno. Resetiranje je dozvoljeno ulogama: ${i.values.map(r=>`<@&${r}>`).join(', ')}`,components:[]});
 }
 if(i.isButton()){
  if(i.customId==='repair:add')return i.showModal(addModal());
  if(i.customId==='repair:reset'){
   if(!canReset(i))return safeReply(i,'⛔ Nemaš dozvolu za resetiranje popravaka.');
   return i.reply({content:'Što želiš resetirati?',components:[new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('repair:reset:one').setLabel('Jedna značka').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('repair:reset:all').setLabel('Sve značke (ručni reset)').setStyle(ButtonStyle.Danger))],flags:MessageFlags.Ephemeral});
  }
  if(i.customId==='repair:reset:one'||i.customId==='repair:reset:all'){
   if(!canReset(i))return safeReply(i,'Nemaš dozvolu.');
   const mode=i.customId.endsWith(':all')?'all':'one';
   if(mode==='one')return i.showModal(new ModalBuilder().setCustomId('repair:reset:confirm:one').setTitle('Reset jedne značke').addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('badge').setLabel('Policijska značka').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('confirmation').setLabel('Upiši RESET za potvrdu').setStyle(TextInputStyle.Short).setRequired(true))));
   return i.showModal(resetModal('all'));
  }
 }
 if(i.isModalSubmit()){
  if(i.customId==='repair:add:submit'){
   const badge=i.fields.getTextInputValue('badge').trim();const raw=i.fields.getTextInputValue('amount').trim();
   if(!/^[a-zA-Z0-9_-]{1,20}$/.test(badge))return safeReply(i,'Značka može sadržavati samo slova, brojeve, _ i -.');
   if(!/^[1-9]\d{0,5}$/.test(raw))return safeReply(i,'Broj popravaka mora biti cijeli broj od 1 do 999999.');
   const amount=Number(raw);await i.deferReply({flags:MessageFlags.Ephemeral});
   db.weekly[badge]=(db.weekly[badge]||0)+amount;db.lifetime[badge]=(db.lifetime[badge]||0)+amount;
   addPlayerRepair(db,badge,i.user.id,amount);
   record('ADD',i.user.id,`Značka ${badge}, +${amount}`);await save();
   try{await updatePanel();await i.editReply(`✅ Značka **${badge}**: dodano **${amount}**. Od zadnjeg reseta: **${db.weekly[badge]}**.`);}catch(e){await i.editReply('Unos je spremljen, ali uređivanje live poruke nije uspjelo. Provjeri dozvole bota.');}
   await auditToChannel(`➕ <@${i.user.id}> dodao ${amount} popravaka za značku ${badge}.`);return;
  }
  if(i.customId.startsWith('repair:reset:confirm:')){
   if(!canReset(i))return safeReply(i,'Nemaš dozvolu za resetiranje.');
   const mode=i.customId.split(':').at(-1);const expected=mode==='all'?'RESET SVE':'RESET';
   if(i.fields.getTextInputValue('confirmation').trim().toUpperCase()!==expected)return safeReply(i,`Reset nije izvršen. Za potvrdu upiši točno ${expected}.`);
   await i.deferReply({flags:MessageFlags.Ephemeral});let detail;
   if(mode==='all') {db.history[`${db.week}-manual-${Date.now()}`]=structuredClone(db.weekly);detail=`Sve značke: ${count(db.weekly)} popravaka`;db.weekly={};db.playersByBadge={};}
   else {const badge=i.fields.getTextInputValue('badge').trim();if(!Object.hasOwn(db.weekly,badge))return i.editReply(`Značka **${badge}** nema popravaka od zadnjeg reseta.`);detail=`Značka ${badge}: ${db.weekly[badge]} popravaka`;delete db.weekly[badge];delete db.playersByBadge[badge];}
   record('RESET',i.user.id,detail);await save();
   try{await updatePanel();await i.editReply(`✅ Resetirano: ${detail}. Ukupno svih vremena ostaje sačuvano.`);}catch(e){await i.editReply('Reset je spremljen, ali ažuriranje poruke nije uspjelo.');}
   await auditToChannel(`↩️ <@${i.user.id}> resetirao: ${detail}.`);return;
  }
 }
 }catch(e){console.error('Interaction:',e);try{await safeReply(i,'Dogodila se greška. Provjeri konzolu bota.');}catch{}}});
async function start(){
 storage = await createStorage({url:process.env.MYSQL_URL, file:FILE, key:GUILD_ID, defaults});
 db = storage.state;
 if(migratePlayers(db))await save();
 console.log(process.env.MYSQL_URL ? 'Pohrana: MySQL spreman.' : 'Pohrana: lokalni data.json.');
 await client.login(DISCORD_TOKEN);
}
start().catch(()=>{console.error('Pokretanje nije uspjelo. Provjeri Discord varijable, MYSQL_URL i dostupnost baze.');process.exit(1);});
