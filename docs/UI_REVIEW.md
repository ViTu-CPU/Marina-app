# Käyttöliittymän analyysi ja parannusehdotukset (2026-11-23)

**Pohja:** sovellus ajettiin (`npm run build`, `vite preview`, Chromium 1440 × 900) tyhjällä projektilla,
demolla "Rectangular basin" generoinnin jälkeen ja Waves-ikkuna täytettynä. Luvut on mitattu
sovelluksesta itsestään (DOM:n `scrollHeight`, käännöstiedosto `src/i18n/en.ts`). Ulkoisia
käytettävyysohjeita (esim. Nielsen Norman Group) ei voitu lukea, koska istunnon verkko ei salli niitä.
Siksi ehdotukset perustuvat havaintoihin eivätkä viittaa niihin. Työmääräarviot (S/M/L) ovat
toteuttajan arvioita, eivät mittauksia.

## Mitattua

| Havainto | Mitattu arvo |
|---|---|
| Vasemman paneelin sisältö / näkyvä korkeus | 1 882 px / 832 px (≈ 2,3 näytöllistä) |
| Oikean paneelin sisältö / näkyvä korkeus (demo generoituna) | 3 223 px / 832 px (≈ 3,9 näytöllistä) |
| Työkalupalkin säätimiä | 15 näkyvää (painikkeet + esimerkkivalikko; generoinnin aikana lisäksi Cancel) |
| Waves-ikkunan harmaita selitetekstejä | 9 kpl, 3 923 merkkiä (≈ 650 sanaa) |
| Vastuuvapauslauseke näytöllä | 2 kertaa (kanvaasin alalaita + sivun alatunniste) |

## A. Pelkkä aaltoanalyysi (liittyy tähän muutokseen)

1. **Sijainti ensin (S).** Waves-ikkunan ensimmäinen osio ("Fetch from the map") pyytää ensin sijainnin
   ("Set the map position (or enter a position under Wind climate) first"), mutta sijaintikenttä on
   ikkunan alaosassa Wind climate -osiossa. Siirretään kenttä ikkunan yläreunaan ja numeroidaan osiot
   työjärjestyksessä: **1 Sijainti → 2 Avovesimatkat → 3 Syvyydet → 4 Tuulet → 5 Tulos → 6 Suojaus**.
2. **Tulos ylös (S).** Tulostettavassa raportissa on nyt yhden rivin tulos (ylittävät suunnat + suositus)
   heti otsikon alla. Sama laatikko ikkunan yläosaan; nyt tulos näkyy vasta 8-rivisen taulukon jälkeen.
3. **Selitteet piiloon (S).** Noin 650 sanaa menetelmätekstiä näkyy koko ajan. Ehdotus: yhden rivin vihje
   jokaiseen osioon ja "Method and sources" -avattava osio. Tulostettu raportti pitää täydet tekstit.
4. **Aaltoikkuna ei peitä karttaa (M).** Ikkuna on modaalinen ja peittää kartan, vaikka avovesimatkan
   säteet piirretään kartalle (taso "Fetch rays"). Kartta ja säteet näkyisivät rinnakkain, jos aallot
   olisivat oikeanpuoleisena paneelina tai omana välilehtenään (Layout | Waves).
5. **Aloitusvalinta (M).** Tyhjässä projektissa kanvaasin keskelle kortti: "Layout study" (piirrä vesialue)
   tai "Wave study only" (avaa Waves ja kysyy sijainnin). Print toimii jo ilman layoutia.

## B. Päänäkymä

6. **Vientitoiminnot yhteen valikkoon (S).** Export PNG / CSV / DXF / Report (PDF) → yksi "Export ▾".
   Työkalupalkki lyhenee 15:stä 12 säätimeen, ja Waves erottuu omana analyysinaan.
7. **Ohjattu aloitus (S–M).** Site-osioon tarkistuslista, jossa on pakolliset vaiheet ja rasti tehdyille:
   Water area → Shoreline → Entrance → Generate. Nyt kymmenen työkalupainiketta ovat samannäköisiä, eikä
   niistä näe, mitkä ovat pakollisia ja missä järjestyksessä.
8. **Oikean paneelin pituus (M).** Lähes neljä näytöllistä. Ehdotus: välilehdet **Alternatives | Compare |
   Anchoring & cost** tai lisäosiot oletuksena suljettuina.
9. **Tilamerkit (S).** Kortilla on rinnakkain "Geometry OK" (keltainen) ja "28 left out (unreachable)"
   (keltainen). Keltainen "OK" on monitulkintainen. Ehdotus: kolmen tilan selite kortin tooltipiin ja
   johdonmukainen värijärjestys (punainen = fail, keltainen = varoituksia, vihreä = constraints met).
10. **Karttatasojen esiasetukset (S).** Ankkurilinjat (punaiset katkoviivat ja merkit) ovat oletuksena
    näkyvissä ja peittävät layoutin. Tasojen esiasetus "Layout" / "Anchoring" / "Waves".
11. **Vastuuvapauslauseke kerran (S, harkittava).** Kanvaasin oma kopio tarvitaan PNG-vientiin (SPEC §1).
    Sen voisi piirtää vain vientikuvaan, jolloin näytöllä olisi yksi lauseke. Vaatimus pysyy: lauseke
    näkyy UI:ssa ja kaikissa vienneissä.

## Ehdotettu järjestys
1 → 2 → 3 → 6 → 7 → 9 (pieniä ja itsenäisiä), sitten 4, 5, 8 ja 10 (rakenteellisia; omistajan päätös
ennen toteutusta).
