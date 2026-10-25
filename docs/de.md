# Broadlink

Steuere deine Broadlink-Geräte **lokal** aus Gladys: kein Broadlink-Konto,
keine Cloud. Die Integration spricht direkt mit den Geräten in deinem Netzwerk
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

## Bevor du beginnst

**Gladys 5.3.0 oder neuer** ist erforderlich.

1. Richte deine Geräte mit der **Broadlink**-App in deinem WLAN ein.
2. Öffne in der App die Einstellungen jedes Geräts und **schalte
   „Gerät sperren“ aus**. Ein gesperrtes Gerät verweigert jeden lokalen
   Befehl: Die Integration ignoriert es.
3. Empfohlen: Gib jedem Gerät eine **feste IP** (DHCP-Reservierung auf
   deinem Router). Ohne sie durchsucht die Integration das Netzwerk von selbst
   erneut (höchstens alle 10 Minuten), wenn ein Gerät nicht mehr antwortet, um
   seine neue Adresse zu finden.

## Geräte hinzufügen

1. Öffne den Tab **Entdecken** der Integration und starte einen
   **Scan** (Schaltfläche **Scannen**).
2. Gladys sendet eine Erkennungsanfrage (UDP-Broadcast, Port 80) in dein lokales
   Netzwerk; die gefundenen Geräte werden angezeigt.
3. Klicke bei den gewünschten Geräten auf **Zu Gladys hinzufügen**.

Jedes Gerät zeigt das Abzeichen **Lokal**, wenn es antwortet, oder **Nicht
erreichbar**, wenn es nicht mehr antwortet (ausgesteckt, IP geändert…).

Ein Gerät erscheint nicht? Es befindet sich wahrscheinlich in einem anderen
Netzwerk / VLAN, oder der Broadcast wird gefiltert. Gib im Tab
**Konfiguration** seine IP-Adresse unter **IP-Adressen der Geräte** ein
(mehrere Adressen durch Kommas getrennt), speichere und scanne erneut.

## Fernbedienungscodes (IR / RF)

Jeder auf einer RM-Fernbedienung gespeicherte Code wird in Gladys zu einem
**Taster** des Geräts: Jeder Druck sendet den Code einmal. Verwende ihn
auf dem Dashboard und in Szenen (Aktion „Gerätewert setzen“).

> **Update von 1.2.0 oder älter**: Codes wurden früher als Ein/Aus-Schalter
> veröffentlicht, sodass die Szenenaktion „Schalter einschalten“ von Gladys und
> die Sprachassistenten einen beliebigen Code der Fernbedienung senden konnten
> (zum Beispiel Vol+). Öffne den Tab **Entdecken** und klicke bei
> jeder Fernbedienung auf **Aktualisieren**: Deine Codes werden zu Tastern. Sie
> behalten ihre Identität, sodass die Dashboards und Szenen, die sie verwenden,
> weiter funktionieren.

In Szenen sendet die Aktion **„Broadlink-Code senden“** einen Code auch über
seinen Namen (Fernbedienung + Name des Codes, mit optionaler Anzahl an
Wiederholungen), ohne den Umweg über einen Taster.

Die Aktionen befinden sich im Tab **Konfiguration**:

- **Fernbedienungscode anlernen**
  - Wähle die Fernbedienung, gib einen Namen ein (z. B. „TV an“) und
    wähle dann **Infrarot** oder **Funk**.
  - Infrarot: Klicke auf die Schaltfläche und drücke dann innerhalb
    von 30 Sekunden die Taste deiner Original-Fernbedienung, auf den Broadlink
    gerichtet.
  - Funk: **Halte** die Taste gedrückt, bis die Frequenz gefunden ist (bis
    zu 30 s), lass sie los und drücke sie dann **einmal** kurz.
- **Code importieren**: Füge einen vorhandenen Broadlink-Code ein, in
  Base64 (Home-Assistant-Format, beginnt mit `JgB`) oder hexadezimal.
- **Code senden**: Teste einen Code über seinen Namen.
- **Gespeicherte Codes auflisten** / **Code löschen**.
- **Gefundene Geräte auflisten**: Name, Modell, IP und MAC jedes Geräts
  (praktisch bei der Fehlersuche).

Öffne nach dem Anlernen, Importieren oder Löschen eines Codes den Tab
**Entdecken** und klicke bei der Fernbedienung auf **Aktualisieren**,
damit der Taster erscheint (oder verschwindet).

Die Codes werden im Datenvolume der Integration gespeichert
(`/data/codes.json`): Sie überstehen Updates.

## Dashboard-Widget

Füge das Widget **Broadlink-Fernbedienung** zu einem Dashboard hinzu und wähle
eine Fernbedienung: Es zeigt ihre Codes als Tasten sowie Temperatur und
Luftfeuchtigkeit, wenn sie den Sensor hat. Ein Tippen sendet den Code einmal.

- **Als Tasten angezeigte Codes** (optional): bis zu 3 Codenamen, durch Kommas
  getrennt (z. B. `TV an, Vol+, Vol-`). Leer: die ersten 3 Codes der
  Fernbedienung.
- **Weitere Codes**: die übrigen Codes in einer Liste, mit der Anzahl, wie oft
  der gewählte Code gesendet wird.

Das Widget kann einen Code senden, sobald er angelernt oder importiert ist: Du
musst das Gerät dafür nicht erst im Tab **Entdecken** aktualisieren.

## Einstellungen

- **IP-Adressen der Geräte**: nur wenn der Scan ein Gerät nicht findet.
- **Aktualisierungsintervall**: wie oft der Zustand der Steckdosen und die
  Sensoren gelesen werden (standardmäßig 60 s, 10 bis 3600 s). Gladys behält
  den Abfragerhythmus bei, mit dem ein Gerät **hinzugefügt** wurde (alle 10, 15,
  30 oder 60 s), und die Integration kann ihn danach nicht mehr ändern. Eine
  Erhöhung des Intervalls gilt immer; eine Senkung **unter 60 s** (oder unter
  den Wert, der beim Hinzufügen des Geräts galt) gilt nur für danach
  hinzugefügte Geräte: Lösche das Gerät in Gladys und füge es über
  den Tab **Entdecken** erneut hinzu, um sie anzuwenden.

## Fehlerbehebung

- **Ein Gerät wird nicht gefunden**: Prüfe, ob es auf Ping antwortet und
  sich im selben Netzwerk wie Gladys befindet, oder gib seine IP in der
  Konfiguration ein.
- **„Authentication failed“ / das Gerät ignoriert Befehle**: Das Gerät ist in
  der Broadlink-App gesperrt, entsperre es.
- **Ein IR-Code wird nicht erfasst**: Halte die Original-Fernbedienung
  näher (5–10 cm) und ziele auf die Oberseite des Broadlink.
- **Protokolle**: Lies die Protokolle der Integration in ihrem Tab **Protokolle** in Gladys (oder
  `docker logs`), mit `LOG_LEVEL=debug` für Details.
