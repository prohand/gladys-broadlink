# Broadlink

Steuern Sie Ihre Broadlink-Geräte **lokal** aus Gladys: kein Broadlink-Konto,
keine Cloud. Die Integration spricht direkt mit den Geräten in Ihrem Netzwerk
(UDP, Port 80).

## Unterstützte Geräte

| Familie                  | Modelle (Beispiele)                               | In Gladys                                   |
| ------------------------ | ------------------------------------------------- | ------------------------------------------- |
| Universalfernbedienungen | RM mini 3, RM pro / pro+, RM4 mini, RM4C, RM4 pro | Ein Taster pro IR/RF-Code + Temp. / Feuchte |
| Smarte Steckdosen        | SP1, SP2, SP mini, SP3, SP3S, SP4L, SP4M, MCB1…   | Ein/Aus (+ Leistung bei SP2S, SP3S, SP4B)   |
| Steckdosenleiste         | MP1                                               | 4 schaltbare Steckdosen                     |
| Umgebungssensor          | A1                                                | Temperatur, Luftfeuchtigkeit                |

- Temperatur / Luftfeuchtigkeit eines RM4 erscheinen nur, wenn sein
  Sensorkabel (HTS2) eingesteckt ist. Der RM pro (RM2) hat einen eingebauten
  Temperatursensor.
- Das Anlernen von Funkcodes (RF 433/315 MHz) ist nur bei den **pro**-Modellen
  (RM pro, RM4 pro) möglich.

## Bevor Sie beginnen

**Gladys 5.1.0 oder neuer** ist erforderlich.

1. Richten Sie Ihre Geräte mit der **Broadlink**-App in Ihrem WLAN ein.
2. Öffnen Sie in der App die Einstellungen jedes Geräts und **schalten Sie
   „Gerät sperren“ aus**. Ein gesperrtes Gerät verweigert jeden lokalen
   Befehl: Die Integration ignoriert es.
3. Empfohlen: Geben Sie jedem Gerät eine **feste IP** (DHCP-Reservierung auf
   Ihrem Router). Ohne sie durchsucht die Integration das Netzwerk von selbst
   erneut (höchstens alle 10 Minuten), wenn ein Gerät nicht mehr antwortet, um
   seine neue Adresse zu finden.

## Geräte hinzufügen

1. Öffnen Sie den Tab **Entdecken** der Integration und starten Sie einen
   **Scan** (Schaltfläche **Scannen**).
2. Gladys sendet eine Erkennungsanfrage (UDP-Broadcast, Port 80) in Ihr lokales
   Netzwerk; die gefundenen Geräte werden angezeigt.
3. Fügen Sie die gewünschten Geräte hinzu.

Jedes Gerät zeigt das Abzeichen **Lokal**, wenn es antwortet, oder **Nicht
erreichbar**, wenn es nicht mehr antwortet (ausgesteckt, IP geändert…).

Ein Gerät erscheint nicht? Es befindet sich wahrscheinlich in einem anderen
Netzwerk / VLAN, oder der Broadcast wird gefiltert. Geben Sie im Tab
**Konfiguration** seine IP-Adresse unter **IP-Adressen der Geräte** ein
(mehrere Adressen durch Kommas getrennt), speichern Sie und scannen Sie erneut.

## Fernbedienungscodes (IR / RF)

Jeder auf einer RM-Fernbedienung gespeicherte Code wird in Gladys zu einem
**Taster** des Geräts: Jeder Druck sendet den Code einmal. Verwenden Sie ihn
auf dem Dashboard und in Szenen (Aktion „Gerät steuern“).

> **Update von 1.2.0 oder älter**: Codes wurden früher als Ein/Aus-Schalter
> veröffentlicht, sodass die Szenenaktion „Schalter einschalten“ von Gladys und
> die Sprachassistenten einen beliebigen Code der Fernbedienung senden konnten
> (zum Beispiel Vol+). Öffnen Sie den Tab **Entdecken** und klicken Sie bei
> jeder Fernbedienung auf **Aktualisieren**: Ihre Codes werden zu Tastern. Sie
> behalten ihre Identität, sodass die Dashboards und Szenen, die sie verwenden,
> weiter funktionieren.

In Szenen sendet die Aktion **„Broadlink-Code senden“** einen Code auch über
seinen Namen (Fernbedienung + Name des Codes, mit optionaler Anzahl an
Wiederholungen), ohne den Umweg über einen Taster.

Die Aktionen befinden sich im Tab **Konfiguration**:

- **Fernbedienungscode anlernen**
  - Wählen Sie die Fernbedienung, geben Sie einen Namen ein (z. B. „TV an“) und
    wählen Sie dann **Infrarot** oder **Funk**.
  - Infrarot: Klicken Sie auf die Schaltfläche und drücken Sie dann innerhalb
    von 30 Sekunden die Taste Ihrer Original-Fernbedienung, auf den Broadlink
    gerichtet.
  - Funk: **Halten** Sie die Taste gedrückt, bis die Frequenz gefunden ist (bis
    zu 30 s), lassen Sie sie los und drücken Sie sie dann **einmal** kurz.
- **Code importieren**: Fügen Sie einen vorhandenen Broadlink-Code ein, in
  Base64 (Home-Assistant-Format, beginnt mit `JgB`) oder hexadezimal.
- **Code senden**: Testen Sie einen Code über seinen Namen.
- **Gespeicherte Codes auflisten** / **Code löschen**.
- **Gefundene Geräte auflisten**: Name, Modell, IP und MAC jedes Geräts
  (praktisch bei der Fehlersuche).

Öffnen Sie nach dem Anlernen, Importieren oder Löschen eines Codes den Tab
**Entdecken** und klicken Sie bei der Fernbedienung auf **Aktualisieren**,
damit der Taster erscheint (oder verschwindet).

Die Codes werden im Datenvolume der Integration gespeichert
(`/data/codes.json`): Sie überstehen Updates.

## Einstellungen

- **IP-Adressen der Geräte**: nur wenn der Scan ein Gerät nicht findet.
- **Aktualisierungsintervall**: wie oft der Zustand der Steckdosen und die
  Sensoren gelesen werden (standardmäßig 60 s, 10 bis 3600 s). Gladys behält
  den Abfragerhythmus bei, mit dem ein Gerät **hinzugefügt** wurde (alle 10, 15,
  30 oder 60 s), und die Integration kann ihn danach nicht mehr ändern. Eine
  Erhöhung des Intervalls gilt immer; eine Senkung **unter 60 s** (oder unter
  den Wert, der beim Hinzufügen des Geräts galt) gilt nur für danach
  hinzugefügte Geräte: Löschen Sie das Gerät in Gladys und fügen Sie es über
  den Tab **Entdecken** erneut hinzu, um sie anzuwenden.

## Fehlerbehebung

- **Ein Gerät wird nicht gefunden**: Prüfen Sie, ob es auf Ping antwortet und
  sich im selben Netzwerk wie Gladys befindet, oder geben Sie seine IP in der
  Konfiguration ein.
- **„Authentication failed“ / das Gerät ignoriert Befehle**: Das Gerät ist in
  der Broadlink-App gesperrt, entsperren Sie es.
- **Ein IR-Code wird nicht erfasst**: Halten Sie die Original-Fernbedienung
  näher (5–10 cm) und zielen Sie auf die Oberseite des Broadlink.
- **Protokolle**: Lesen Sie die Protokolle der Integration in Gladys (oder
  `docker logs`), mit `LOG_LEVEL=debug` für Details.
