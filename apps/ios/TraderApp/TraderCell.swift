import UIKit
import KitCore

@MainActor
enum TraderFonts {
    static let headline=UIFont.preferredFont(forTextStyle:.headline)
    static let caption=UIFont.preferredFont(forTextStyle:.caption1)
    static let small=UIFont.preferredFont(forTextStyle:.caption2)
    static let body=UIFont.preferredFont(forTextStyle:.subheadline)
    static let code=UIFontMetrics(forTextStyle:.caption1).scaledFont(for:.monospacedSystemFont(ofSize:13,weight:.regular))
    static let metric=UIFontMetrics(forTextStyle:.title2).scaledFont(for:.monospacedDigitSystemFont(ofSize:22,weight:.semibold))
    static func prepare(){_=headline;_=caption;_=small;_=body;_=code;_=metric}
}

@MainActor
final class TraderCell:UITableViewCell {
    private let stack=UIStackView(), titleLabel=UILabel(),subtitleLabel=UILabel(),bodyLabel=UILabel(),badgeLabel=UILabel(),stats=UIStackView()
    private var chart:EquityView?
    private var statValues:[UILabel]=[],statNames:[UILabel]=[]
    override init(style:UITableViewCell.CellStyle,reuseIdentifier:String?) {
        super.init(style:style,reuseIdentifier:reuseIdentifier)
        backgroundColor = .secondarySystemGroupedBackground
        stack.axis = .vertical;stack.spacing=7;stack.translatesAutoresizingMaskIntoConstraints=false
        contentView.addSubview(stack)
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo:contentView.layoutMarginsGuide.leadingAnchor),stack.trailingAnchor.constraint(equalTo:contentView.layoutMarginsGuide.trailingAnchor),stack.topAnchor.constraint(equalTo:contentView.topAnchor,constant:14),stack.bottomAnchor.constraint(equalTo:contentView.bottomAnchor,constant:-14)])
        for label in [titleLabel,subtitleLabel,bodyLabel,badgeLabel]{label.numberOfLines=0;stack.addArrangedSubview(label)}
        titleLabel.font = TraderFonts.headline
        subtitleLabel.font = TraderFonts.caption;subtitleLabel.textColor = .secondaryLabel
        bodyLabel.font = TraderFonts.body;bodyLabel.textColor = .secondaryLabel
        badgeLabel.font = TraderFonts.small;badgeLabel.textColor = .systemTeal
        for label in [titleLabel,subtitleLabel,bodyLabel,badgeLabel]{label.adjustsFontForContentSizeCategory=true}
        stats.axis = .horizontal;stats.distribution = .fillEqually;stats.spacing=12;stack.addArrangedSubview(stats)
        for _ in 0..<3 {
            let column=UIStackView();column.axis = .vertical;column.spacing=2
            let value=UILabel();value.font=TraderFonts.metric;value.adjustsFontForContentSizeCategory=true
            value.adjustsFontSizeToFitWidth=true;value.minimumScaleFactor=0.65
            let label=UILabel();label.font=TraderFonts.small;label.adjustsFontForContentSizeCategory=true;label.textColor = .secondaryLabel;label.numberOfLines=2
            column.addArrangedSubview(value);column.addArrangedSubview(label);stats.addArrangedSubview(column)
            statValues.append(value);statNames.append(label)
        }
    }
    required init?(coder:NSCoder){fatalError("init(coder:)")}
    func configure(_ row:Row) {
        FrameMonitor.shared.measure("trader.cell") {
            titleLabel.text=row.title;titleLabel.isHidden=row.title.isEmpty
            subtitleLabel.text=row.subtitle;subtitleLabel.isHidden=row.subtitle.isEmpty
            bodyLabel.text=row.body;bodyLabel.isHidden=row.body.isEmpty
            bodyLabel.font=row.code ? TraderFonts.code:TraderFonts.body
            bodyLabel.lineBreakMode=row.code ? .byCharWrapping:.byWordWrapping
            badgeLabel.text=row.badge;badgeLabel.isHidden=row.badge.isEmpty
            stats.isHidden=row.stats.isEmpty
            stats.axis=traitCollection.preferredContentSizeCategory.isAccessibilityCategory ? .vertical:.horizontal
            for i in 0..<3 {
                stats.arrangedSubviews[i].isHidden=i>=row.stats.count
                guard i<row.stats.count else{continue}
                let stat=row.stats[i],value=statValues[i];value.text=stat.value
                value.textColor=stat.tone>0 ? .systemGreen:stat.tone<0 ? .systemRed:.label
                statNames[i].text=stat.label
            }
            chart?.removeFromSuperview();chart=nil
            if !row.points.isEmpty {
                let v=EquityView();v.backgroundColor = .clear;v.isOpaque=false;v.points=row.points;v.heightAnchor.constraint(equalToConstant:180).isActive=true
                stack.addArrangedSubview(v);chart=v
            }
            accessoryType=row.route != nil ? .disclosureIndicator:.none
            selectionStyle=(row.route != nil || !row.action.isEmpty) ? .default:.none
            accessibilityIdentifier=row.id
        }
    }
}

@MainActor
final class EquityView:UIView {
    var points:[Plot]=[]{didSet{setNeedsDisplay()}}
    override func draw(_ rect:CGRect) {
        guard points.count>1,let context=UIGraphicsGetCurrentContext() else{return}
        FrameMonitor.shared.measure("trader.chart") {
            let values=points.map(\.value),lo=values.min()!,hi=values.max()!,span=max(hi-lo,1),box=rect.insetBy(dx:3,dy:12)
            context.setStrokeColor(UIColor.separator.cgColor);context.setLineWidth(0.5)
            for i in 0...3 {let y=box.minY+box.height*CGFloat(i)/3;context.move(to:CGPoint(x:box.minX,y:y));context.addLine(to:CGPoint(x:box.maxX,y:y))};context.strokePath()
            let path=UIBezierPath()
            for (i,p) in points.enumerated(){let x=box.minX+box.width*CGFloat(i)/CGFloat(points.count-1),y=box.maxY-box.height*CGFloat((p.value-lo)/span);if i==0{path.move(to:CGPoint(x:x,y:y))}else{path.addLine(to:CGPoint(x:x,y:y))}}
            UIColor.systemTeal.setStroke();path.lineWidth=2;path.stroke()
        }
    }
}
