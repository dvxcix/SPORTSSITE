import SwiftUI

struct DugoutParkShape: Decodable {
    let viewBox: String
    let outfield: String
    let transform: String?

    var bounds: CGRect {
        let values = viewBox.split(separator: " ").compactMap { Double($0) }
        guard values.count == 4, values[2] > 0, values[3] > 0 else { return CGRect(x: 0, y: 0, width: 250, height: 250) }
        return CGRect(x: values[0], y: values[1], width: values[2], height: values[3])
    }

    func field() -> Path {
        guard let path = ParkPath(outfield).path() else { return Self.generic }
        let values = transform?.replacingOccurrences(of: "matrix(", with: "")
            .replacingOccurrences(of: ")", with: "").split(whereSeparator: { $0.isWhitespace || $0 == "," })
            .compactMap { Double($0) }
        guard let values, values.count == 6 else { return path }
        return path.applying(CGAffineTransform(a: values[0], b: values[1], c: values[2], d: values[3], tx: values[4], ty: values[5]))
    }

    static let generic = Path { path in
        path.move(to: CGPoint(x: 125, y: 223))
        path.addLine(to: CGPoint(x: 24, y: 106))
        path.addQuadCurve(to: CGPoint(x: 226, y: 106), control: CGPoint(x: 125, y: -12))
        path.closeSubpath()
    }
}

struct DugoutParkField: View {
    let shape: DugoutParkShape?
    let team: DugoutBoard.Team

    var body: some View {
        Canvas { context, size in
            let scale = Self.transform(bounds: shape?.bounds ?? CGRect(x: 0, y: 0, width: 250, height: 250), in: size)
            let field = (shape?.field() ?? DugoutParkShape.generic).applying(scale)
            context.fill(field, with: .linearGradient(Gradient(colors: [team.color.opacity(0.59), team.color.opacity(0.20)]),
                startPoint: .zero, endPoint: CGPoint(x: size.width, y: size.height)))
            context.stroke(field, with: .color(team.color.opacity(0.85)), lineWidth: 2)
            context.fill(Self.infield.applying(scale), with: .color(team.secondaryColor.opacity(0.52)))
            context.stroke(Self.foulLines.applying(scale), with: .color(.white.opacity(0.55)), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
            context.fill(Self.bases.applying(scale), with: .color(.white.opacity(0.72)))
        }
        .accessibilityHidden(true)
    }

    static func transform(bounds: CGRect, in size: CGSize) -> CGAffineTransform {
        let scale = min(size.width / bounds.width, size.height / bounds.height)
        return CGAffineTransform(a: scale, b: 0, c: 0, d: scale,
            tx: (size.width - bounds.width * scale) / 2 - bounds.minX * scale,
            ty: (size.height - bounds.height * scale) / 2 - bounds.minY * scale)
    }

    private static let infield = Path { path in
        path.move(to: CGPoint(x: 125, y: 203))
        path.addLine(to: CGPoint(x: 86, y: 166))
        path.addQuadCurve(to: CGPoint(x: 164, y: 166), control: CGPoint(x: 125, y: 104))
        path.closeSubpath()
    }

    private static let foulLines = Path { path in
        path.move(to: CGPoint(x: 28, y: 106))
        path.addLine(to: CGPoint(x: 125, y: 203))
        path.addLine(to: CGPoint(x: 222, y: 106))
    }

    private static let bases = Path { path in
        for point in [CGPoint(x: 125, y: 203), CGPoint(x: 101, y: 177), CGPoint(x: 149, y: 177), CGPoint(x: 125, y: 150)] {
            path.addEllipse(in: CGRect(x: point.x - 1.8, y: point.y - 1.8, width: 3.6, height: 3.6))
        }
    }
}

private struct ParkPath {
    private let tokens: [Substring]

    init(_ source: String) {
        let token = /[MLHVCSZmlhvcsz]|[+-]?(?:\d+\.?\d*|\.\d+)/
        tokens = source.matches(of: token).map(\.output)
    }

    func path() -> Path? {
        var path = Path()
        var index = 0
        var command = "M"
        var current = CGPoint.zero
        var start = CGPoint.zero
        var priorControl: CGPoint?
        while index < tokens.count {
            if let first = tokens[index].first, first.isLetter {
                command = String(tokens[index])
                index += 1
            }
            let absolute = command == command.uppercased()
            let root = absolute ? CGPoint.zero : current
            let kind = command.uppercased()
            if kind == "Z" {
                path.closeSubpath()
                current = start
                priorControl = nil
                if index < tokens.count, tokens[index].first?.isLetter != true { return nil }
                continue
            }
            let count = switch kind { case "H", "V": 1; case "C": 6; case "S": 4; default: 2 }
            guard index + count <= tokens.count else { return nil }
            let values = tokens[index..<(index + count)].compactMap { Double($0) }
            guard values.count == count else { return nil }
            index += count
            func point(_ offset: Int) -> CGPoint { CGPoint(x: root.x + values[offset], y: root.y + values[offset + 1]) }
            let end: CGPoint
            switch kind {
            case "M":
                end = point(0)
                path.move(to: end)
                start = end
                command = absolute ? "L" : "l"
            case "H":
                end = CGPoint(x: root.x + values[0], y: current.y)
                path.addLine(to: end)
            case "V":
                end = CGPoint(x: current.x, y: root.y + values[0])
                path.addLine(to: end)
            case "C":
                end = point(4)
                path.addCurve(to: end, control1: point(0), control2: point(2))
                priorControl = point(2)
            case "S":
                end = point(2)
                let previous = priorControl ?? current
                let reflected = CGPoint(x: 2 * current.x - previous.x, y: 2 * current.y - previous.y)
                path.addCurve(to: end, control1: reflected, control2: point(0))
                priorControl = point(0)
            case "L":
                end = point(0)
                path.addLine(to: end)
            default: return nil
            }
            current = end
            if kind != "C" && kind != "S" { priorControl = nil }
        }
        return path.isEmpty ? nil : path
    }
}
