# Police Repairs Bot

Discord bot za evidenciju popravaka po policijskim značkama. Jedna stalna live poruka, dva gumba, tjedni i ukupni brojači.

## Instalacija

1. Instaliraj **Node.js 20.11+**.
2. Otvori folder bota i pokreni `npm install`.
3. Kopiraj `.env.example` u `.env` i upiši:
   - `DISCORD_TOKEN`: Bot token iz Discord Developer Portala
   - `CLIENT_ID`: Application ID
   - `GUILD_ID`: Discord server ID
   - `CHANNEL_ID`: kanal za stalnu poruku
   - `LOG_CHANNEL_ID`: opcionalno kanal za audit
4. U Discord Developer Portalu pozovi bota na server s opsegom `bot` i `applications.commands`, dozvolama **View Channel**, **Send Messages**, **Embed Links**, **Read Message History**.
5. Pokreni `npm start`.
6. Bot automatski objavljuje stalnu poruku u postavljenom kanalu. `/postavi` osvježava/obnavlja poruku.
7. Administrator koristi `/uloge` i odabire uloge kojima je dopušten reset.

## Funkcije

- **Dodaj popravku**: bilo koji član koji vidi poruku unosi značku i broj popravaka.
- **Resetiraj popravku**: samo administrator ili odabrana uloga. Izbor resetiranja jedne značke ili svih tjednih popravaka; obavezna tekstualna potvrda.
- **/uloge**: administrator odabire 1-10 uloga za reset. Ako ih ima više od 25, izbornik prikazuje prvih 25 po hijerarhiji.
- **/status**: prikazuje ukupne brojeve i ovlaštene uloge.
- **/postavi**: administrator ponovno postavlja ili osvježava live poruku.
- Tjedni brojač automatski počinje ispočetka **ponedjeljkom po vremenu Europe/Zagreb**. Prethodni tjedan ostaje u `history` unutar `data.json`.
- Ukupno svih vremena se **ne smanjuje** ručnim ili tjednim resetom.
- `data.json` sadrži statistiku, povijest, audit i ID stalne poruke. **Redovito ga sigurnosno kopiraj.**

## Važno za hosting

Za trajnu evidenciju host mora imati **persistent storage**. Ako hosting briše datoteke pri svakom deployu, `data.json` neće ostati sačuvan. Ovaj mali bot ne zahtijeva MySQL; koristi lokalnu JSON datoteku.

Nemoj objavljivati `.env` ni bot token. Na Railwayu i sličnim hostovima postavi env varijable u panelu, a podatkovnu datoteku na trajni volume (ili odaberi hosting s trajnim diskom).

## Sigurnost i ograničenja

- Komandu `/uloge` i `/postavi` mogu izvršavati samo administratori.
- Administratori mogu resetirati bez obzira na odabranu ulogu.
- Reset zahtijeva potvrdu `RESET` ili `RESET SVE`.
- Promjene se zapisuju u audit. Ako je postavljen `LOG_CHANNEL_ID`, šalje se i poruka u kanal.
- Discord embed može prikazati ograničen broj redaka; ako postoji jako mnogo znački, prikazuje se dio popisa, a svi podaci ostaju spremljeni.
