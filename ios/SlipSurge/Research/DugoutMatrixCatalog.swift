import Foundation

enum DugoutMatrixCatalog {
    struct Field: Identifiable {
        let id: String
        let label: String
        var signed = false
        var boolean = false
        var movement = false
    }

    struct Category: Identifiable {
        let id: String
        let title: String
        let fields: [Field]
    }

    static let categories: [Category] = [
        .init(id: "odds", title: "Odds", fields: [
            .init(id: "fhr", label: "First HR"),
            .init(id: "hr", label: "Anytime HR"),
            .init(id: "hrml", label: "HR / Moneyline Parlay"),
            .init(id: "laser", label: "Laser (105+ MPH HR)"),
            .init(id: "laser110", label: "Laser (110+ MPH HR)"),
            .init(id: "moonshot", label: "Moonshot"),
            .init(id: "pa1", label: "1st PA Home Run"),
            .init(id: "rbi1", label: "1+ RBI"),
            .init(id: "rbi2", label: "2+ RBI"),
            .init(id: "rbi3", label: "3+ RBI"),
            .init(id: "hrr", label: "Hits + Runs + RBIs"),
            .init(id: "tb2", label: "2+ Total Bases"),
            .init(id: "tb3", label: "3+ Total Bases"),
            .init(id: "tb4", label: "4+ Total Bases"),
            .init(id: "tb5", label: "5+ Total Bases"),
            .init(id: "hr2", label: "2+ Home Runs"),
            .init(id: "singles", label: "1+ Single"),
            .init(id: "doubles", label: "1+ Double"),
            .init(id: "triples", label: "1+ Triple"),
            .init(id: "sb1", label: "1+ Stolen Base"),
            .init(id: "sb2", label: "2+ Stolen Bases"),
            .init(id: "hits1", label: "1+ Hit"),
            .init(id: "hits2", label: "2+ Hits"),
            .init(id: "runs1", label: "1+ Run"),
            .init(id: "runs2", label: "2+ Runs"),
            .init(id: "booksfhr", label: "Books missing First HR odds"),
            .init(id: "bookshr", label: "Books missing Anytime HR odds"),
        ]),
        .init(id: "dugout_specs", title: "Dugout Specs", fields: [
            .init(id: "is_pwr", label: "Is PWR ⚡?", boolean: true),
            .init(id: "div", label: "DIV (FD − Caesars FHR)", signed: true),
            .init(id: "fhr_div_sa", label: "FHR ÷ HR"),
            .init(id: "m_div_f", label: "M ÷ F (BetMGM ÷ FanDuel)"),
            .init(id: "sa_div_ml", label: "HR ÷ Parlay"),
            .init(id: "pa1_div_sa", label: "PA ÷ HR"),
            .init(id: "sa_div_rbi", label: "HR ÷ RBI"),
            .init(id: "sa_div_rbi2", label: "HR ÷ RBI2"),
            .init(id: "sa_div_rbi3", label: "HR ÷ RBI3"),
            .init(id: "sa_div_hrr", label: "HR ÷ HRR"),
            .init(id: "sa_div_tb", label: "HR ÷ TB"),
            .init(id: "sa_div_tb3", label: "HR ÷ TB3"),
            .init(id: "sa_div_tb4", label: "HR ÷ TB4"),
            .init(id: "sa_div_tb5", label: "HR ÷ TB5"),
            .init(id: "sa_div_hr2", label: "HR ÷ 2HR"),
            .init(id: "fhr_div_sa_move", label: "FHR / HR movement (open to now)", signed: true, movement: true),
            .init(id: "m_div_f_move", label: "M / F movement (open to now)", signed: true, movement: true),
            .init(id: "pa1_div_sa_move", label: "PA / HR movement (open to now)", signed: true, movement: true),
            .init(id: "sa_div_ml_move", label: "HR / Parlay movement (open to now)", signed: true, movement: true),
            .init(id: "sa_div_rbi_move", label: "HR / RBI movement (open to now)", signed: true, movement: true),
            .init(id: "sa_div_rbi2_move", label: "HR / RBI2 movement (open to now)", signed: true, movement: true),
            .init(id: "sa_div_rbi3_move", label: "HR / RBI3 movement (open to now)", signed: true, movement: true),
            .init(id: "sa_div_hrr_move", label: "HR / HRR movement (open to now)", signed: true, movement: true),
            .init(id: "sa_div_tb_move", label: "HR / TB2 movement (open to now)", signed: true, movement: true),
            .init(id: "sa_div_tb3_move", label: "HR / TB3 movement (open to now)", signed: true, movement: true),
            .init(id: "sa_div_tb4_move", label: "HR / TB4 movement (open to now)", signed: true, movement: true),
            .init(id: "sa_div_tb5_move", label: "HR / TB5 movement (open to now)", signed: true, movement: true),
            .init(id: "sa_div_hr2_move", label: "HR / 2HR movement (open to now)", signed: true, movement: true),
            .init(id: "fhr_pct", label: "FHR % (vs. season avg)", signed: true),
            .init(id: "sa_pct", label: "HR % (vs. season avg)", signed: true),
            .init(id: "mm", label: "MM (Sportsbook Rank − Statcast Rank)", signed: true),
            .init(id: "bk_rk", label: "Sportsbook Rank (Anytime HR, 1 = game favorite)"),
            .init(id: "pp_rk", label: "Statcast Rank (Paper Score, 1 = best in game)"),
            .init(id: "mm_move", label: "MM Movement (biggest change across windows)"),
        ]),
        .init(id: "pitchlog_stat", title: "Stat Line", fields: [
            .init(id: "pa", label: "Plate Appearances"),
            .init(id: "h", label: "Hits"),
            .init(id: "1b", label: "Singles"),
            .init(id: "2b", label: "Doubles"),
            .init(id: "3b", label: "Triples"),
            .init(id: "hr", label: "Home Runs"),
            .init(id: "bb", label: "Walks"),
            .init(id: "k", label: "Strikeouts"),
            .init(id: "avg", label: "Batting Average"),
            .init(id: "obp", label: "On-Base %"),
            .init(id: "slg", label: "Slugging %"),
            .init(id: "whiff", label: "Whiff %"),
            .init(id: "chase", label: "Chase %"),
            .init(id: "avgev", label: "Avg Exit Velocity"),
            .init(id: "la", label: "Avg Launch Angle"),
            .init(id: "hh", label: "Hard-Hit %"),
            .init(id: "brl", label: "Barrel %"),
            .init(id: "sweetspot", label: "Sweet Spot %"),
            .init(id: "xwoba", label: "xwOBA (Contact)"),
            .init(id: "bspd", label: "Avg Bat Speed"),
            .init(id: "atk", label: "Avg Attack Angle"),
            .init(id: "swlen", label: "Avg Swing Length"),
            .init(id: "tilt", label: "Avg Swing Tilt"),
            .init(id: "attackdir", label: "Avg Attack Direction"),
        ]),
        .init(id: "savant_stat", title: "Bat Tracking", fields: [
            .init(id: "hardsw", label: "Hard-Swing %"),
            .init(id: "sq", label: "Squared-Up %"),
            .init(id: "blast", label: "💥 Blast %"),
            .init(id: "idlaa", label: "Ideal Attack-Angle %"),
            .init(id: "pullair", label: "Pull Air Rate"),
            .init(id: "fb", label: "Fly-Ball Rate"),
            .init(id: "timing", label: "Timing %"),
            .init(id: "miss", label: "Miss Distance"),
        ]),
        .init(id: "picks", title: "Picks", fields: [
            .init(id: "hr", label: "HR Picks"),
            .init(id: "hrPct", label: "HR Picks — % of Game"),
            .init(id: "hits", label: "Hits Picks"),
            .init(id: "hitsPct", label: "Hits Picks — % of Game"),
            .init(id: "runs", label: "Runs Picks"),
            .init(id: "runsPct", label: "Runs Picks — % of Game"),
            .init(id: "stolenBases", label: "Stolen Base Picks"),
            .init(id: "stolenBasesPct", label: "Stolen Base Picks — % of Game"),
            .init(id: "singles", label: "Singles Picks"),
            .init(id: "singlesPct", label: "Singles Picks — % of Game"),
            .init(id: "doubles", label: "Doubles Picks"),
            .init(id: "doublesPct", label: "Doubles Picks — % of Game"),
            .init(id: "triples", label: "Triples Picks"),
            .init(id: "triplesPct", label: "Triples Picks — % of Game"),
            .init(id: "rbi", label: "RBI Picks"),
            .init(id: "rbiPct", label: "RBI Picks — % of Game"),
            .init(id: "hrr", label: "HRR Picks"),
            .init(id: "hrrPct", label: "HRR Picks — % of Game"),
            .init(id: "tb", label: "TB Picks"),
            .init(id: "tbPct", label: "TB Picks — % of Game"),
        ]),
    ]

    static func fields(_ category: String) -> [Field] { categories.first { $0.id == category }?.fields ?? [] }

    static func field(_ category: String, _ key: String) -> Field? { fields(category).first { $0.id == key } }
}
