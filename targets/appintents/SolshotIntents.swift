import AppIntents
import Foundation

// Solshot intents reuse the same NOAA low-precision series the JS engine ships, so a Siri or
// Spotlight answer can never disagree with the sun path drawn in the app. Everything is
// computed on device; no location permission and no network.

private let rad = Double.pi / 180
private let deg = 180 / Double.pi

private func norm360(_ x: Double) -> Double {
  let v = x.truncatingRemainder(dividingBy: 360)
  return v < 0 ? v + 360 : v
}

private struct SolarInstant {
  let altitude: Double
  let azimuth: Double
}

private func solarPosition(_ date: Date, lat: Double, lng: Double) -> SolarInstant {
  let jd = date.timeIntervalSince1970 / 86400 + 2440587.5
  let t = (jd - 2451545.0) / 36525.0

  let l0 = norm360(280.46646 + t * (36000.76983 + 0.0003032 * t))
  let m = 357.52911 + t * (35999.05029 - 0.0001537 * t)
  let e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
  let mr = m * rad
  let c =
    sin(mr) * (1.914602 - t * (0.004817 + 0.000014 * t))
    + sin(2 * mr) * (0.019993 - 0.000101 * t)
    + sin(3 * mr) * 0.000289
  let trueLong = l0 + c
  let omega = 125.04 - 1934.136 * t
  let appLong = trueLong - 0.00569 - 0.00478 * sin(omega * rad)

  let meanObliquity = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60
  let obliquity = meanObliquity + 0.00256 * cos(omega * rad)
  let declination = asin(sin(obliquity * rad) * sin(appLong * rad)) * deg

  let y = pow(tan((obliquity / 2) * rad), 2)
  let l0r = l0 * rad
  let eot =
    4 * deg
    * (y * sin(2 * l0r)
      - 2 * e * sin(mr)
      + 4 * e * y * sin(mr) * cos(2 * l0r)
      - 0.5 * y * y * sin(4 * l0r)
      - 1.25 * e * e * sin(2 * mr))

  let seconds = date.timeIntervalSince1970
  let utcMinutes = ((seconds.truncatingRemainder(dividingBy: 86400)) + 86400).truncatingRemainder(dividingBy: 86400) / 60
  let tsmin = (utcMinutes + eot + 4 * lng + 1440).truncatingRemainder(dividingBy: 1440)
  let hourAngle = tsmin / 4 - 180

  let latR = lat * rad
  let decR = declination * rad
  let haR = hourAngle * rad
  let sinAlt = sin(latR) * sin(decR) + cos(latR) * cos(decR) * cos(haR)
  let altitude = asin(max(-1, min(1, sinAlt))) * deg
  let cosAz = (sin(latR) * sinAlt - sin(decR)) / max(1e-9, cos(latR) * cos(altitude * rad))
  let azBase = acos(max(-1, min(1, cosAz))) * deg
  let azimuth = norm360(hourAngle > 0 ? (azBase + 180).truncatingRemainder(dividingBy: 360) : (540 - azBase).truncatingRemainder(dividingBy: 360))
  return SolarInstant(altitude: altitude, azimuth: azimuth)
}

private func crossing(_ dayStart: Date, lat: Double, lng: Double, target: Double, rising: Bool) -> Date? {
  let step = 600 // 10-minute grid, same as the JS kernel
  var previous = solarPosition(dayStart, lat: lat, lng: lng).altitude - target
  for i in 1...144 {
    let when = dayStart.addingTimeInterval(Double(i * step))
    let current = solarPosition(when, lat: lat, lng: lng).altitude - target
    if rising && previous <= 0 && current > 0 { return refine(dayStart.addingTimeInterval(Double((i - 1) * step)), when, lat, lng, target) }
    if !rising && previous > 0 && current <= 0 { return refine(dayStart.addingTimeInterval(Double((i - 1) * step)), when, lat, lng, target) }
    previous = current
  }
  return nil
}

private func refine(_ a0: Date, _ b0: Date, _ lat: Double, _ lng: Double, _ target: Double) -> Date {
  var a = a0
  var b = b0
  for _ in 0..<24 {
    let mid = a.addingTimeInterval(b.timeIntervalSince(a) / 2)
    let fa = solarPosition(a, lat: lat, lng: lng).altitude - target
    let fm = solarPosition(mid, lat: lat, lng: lng).altitude - target
    if fa * fm <= 0 { b = mid } else { a = mid }
  }
  return a.addingTimeInterval(b.timeIntervalSince(a) / 2)
}

private func solarNoon(_ dayStart: Date, lat: Double, lng: Double) -> Date {
  var lo = dayStart.addingTimeInterval(6 * 3600)
  var hi = dayStart.addingTimeInterval(18 * 3600)
  for _ in 0..<48 {
    let m1 = lo.addingTimeInterval(hi.timeIntervalSince(lo) / 3)
    let m2 = hi.addingTimeInterval(-hi.timeIntervalSince(lo) / 3)
    if solarPosition(m1, lat: lat, lng: lng).altitude > solarPosition(m2, lat: lat, lng: lng).altitude { hi = m2 } else { lo = m1 }
  }
  return lo.addingTimeInterval(hi.timeIntervalSince(lo) / 2)
}

private func clock(_ date: Date, _ zone: TimeZone) -> String {
  let f = DateFormatter()
  f.timeZone = zone
  f.locale = Locale(identifier: "en_US_POSIX")
  f.dateFormat = "h:mm a"
  return f.string(from: date)
}

private func zoneFor(_ lng: Double) -> TimeZone {
  TimeZone(secondsFromGMT: Int(round(lng / 15)) * 3600) ?? TimeZone(identifier: "UTC")!
}

@available(iOS 16.0, *)
struct SunTimesIntent: AppIntent {
  static var title: LocalizedStringResource = "Sunrise, sunset and golden hour"
  static var description: IntentDescription? = IntentDescription(
    "Reports sunrise and sunset, solar noon, day length and the golden-hour windows for a latitude and longitude."
  )
  static var openAppWhenRun: Bool = true

  @Parameter(title: "Latitude", description: "Degrees north, negative for south.")
  var latitude: Double

  @Parameter(title: "Longitude", description: "Degrees east, negative for west.")
  var longitude: Double

  @Parameter(title: "Date", description: "Leave empty for today.")
  var date: Date?

  static var parameterSummary: some ParameterSummary {
    Summary("Sun times at \(\.$latitude), \(\.$longitude)")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let zone = zoneFor(longitude)
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = zone
    let day = calendar.startOfDay(for: date ?? Date())

    let rise = crossing(day, lat: latitude, lng: longitude, target: -0.833, rising: true)
    let set = crossing(day, lat: latitude, lng: longitude, target: -0.833, rising: false)
    let noon = solarNoon(day, lat: latitude, lng: longitude)
    let golden = crossing(day, lat: latitude, lng: longitude, target: 6, rising: false)

    guard let sunrise = rise, let sunset = set, sunset > sunrise else {
      return .result(dialog: "The sun does not cross the horizon at \(String(format: "%.2f", latitude))° today — midnight sun or polar night.")
    }
    let length = sunset.timeIntervalSince(sunrise)
    let hours = Int(length / 3600)
    let minutes = Int((length - Double(hours * 3600)) / 60)
    let noonText = clock(noon, zone) + ", " + String(format: "%.1f", solarPosition(noon, lat: latitude, lng: longitude).altitude) + "° high"
    var text = "Sunrise \(clock(sunrise, zone)), sunset \(clock(sunset, zone)). Solar noon \(noonText). Daylight \(hours) h \(String(format: "%02d", minutes)) m."
    if let g = golden, g > sunrise, g < sunset {
      text += " Golden hour ends at \(clock(g, zone))."
    }
    return .result(dialog: "\(text)")
  }
}

@available(iOS 16.0, *)
struct OpenSolshotIntent: AppIntent {
  static var title: LocalizedStringResource = "Open Solshot"
  static var description: IntentDescription? = IntentDescription(
    "Opens Solshot's offline sun path diagram, light windows and shadow planner."
  )
  static var openAppWhenRun: Bool = true

  func perform() async throws -> some IntentResult {
    return .result()
  }
}

@available(iOS 16.0, *)
struct SolshotShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: SunTimesIntent(),
      phrases: [
        "Sun times in \(.applicationName)",
        "Golden hour in \(.applicationName)",
        "When is sunset in \(.applicationName)",
      ],
      shortTitle: "Sun times",
      systemImageName: "sun.max"
    )
    AppShortcut(
      intent: OpenSolshotIntent(),
      phrases: ["Open \(.applicationName)", "Show the sun path in \(.applicationName)"],
      shortTitle: "Open Solshot",
      systemImageName: "sun.horizon"
    )
  }
}


// MARK: - Solar event entity (Spotlight + Siri parameter)

// 太阳事件的边界是固定仰角，跟地点无关；地点相关的时刻仍然走 SunTimesIntent。
@available(iOS 16.0, *)
struct SolarEventEntity: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = TypeDisplayRepresentation(name: "Sun event")
  static var defaultQuery = SolarEventQuery()

  let id: String
  let summary: String
  let definition: String
  /// Centre-of-disc elevation that marks the event, in degrees.
  let elevationDegrees: Double

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\(summary)", subtitle: "\(elevationDegrees)°")
  }

  static let all: [SolarEventEntity] = [
    SolarEventEntity(id: "sunrise", summary: "Sunrise", definition: "Upper limb touches the horizon, morning", elevationDegrees: -0.833),
    SolarEventEntity(id: "sunset", summary: "Sunset", definition: "Upper limb touches the horizon, evening", elevationDegrees: -0.833),
    SolarEventEntity(id: "golden-morning", summary: "Golden hour (morning)", definition: "Sun between the horizon and 6° up, warm and low-contrast", elevationDegrees: 6),
    SolarEventEntity(id: "golden-evening", summary: "Golden hour (evening)", definition: "Sun between 6° and the horizon, warm and low-contrast", elevationDegrees: 6),
    SolarEventEntity(id: "civil-dusk", summary: "Civil dusk", definition: "Sun 6° below the horizon; outdoor detail fades", elevationDegrees: -6),
    SolarEventEntity(id: "blue-hour", summary: "Blue hour", definition: "Sun between 6° and 4° below the horizon", elevationDegrees: -4),
  ]
}

@available(iOS 18.0, *)
extension SolarEventEntity: IndexedEntity {}

@available(iOS 16.0, *)
struct SolarEventQuery: EntityQuery {
  func entities(for identifiers: [String]) async throws -> [SolarEventEntity] {
    SolarEventEntity.all.filter { identifiers.contains($0.id) }
  }

  func suggestedEntities() async throws -> [SolarEventEntity] {
    SolarEventEntity.all
  }

  func defaultResult() async -> SolarEventEntity? {
    SolarEventEntity.all.first
  }
}

@available(iOS 16.0, *)
struct SolarEventMeaningIntent: AppIntent {
  static var title: LocalizedStringResource = "What a sun event means"
  static var description = IntentDescription("Definition and elevation of a solar event, independent of where you are.")

  @Parameter(title: "Sun event")
  var event: SolarEventEntity

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let elevation = event.elevationDegrees
    let text = "\(event.summary): \(event.definition). The sun sits at \(String(format: "%.2f", elevation))° at this boundary."
    return .result(dialog: IntentDialog(stringLiteral: text))
  }
}
