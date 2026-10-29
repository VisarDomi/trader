import UIKit
import KitCore
import KitLists
import KitNavigation

@MainActor
final class ScreenController:UITableViewController,LiveScreen,UISearchResultsUpdating {
    var place:Route
    private var state:ScreenState
    private var content:Content
    private var loadTask:Task<Void,Never>?
    private var timer:Timer?
    private var deferred:Content?
    private var deferredStatus:String?
    private var visible=false,restored=false
    private var configuringSearch=true
    private var lastSave:CFTimeInterval=0
    private let search=UISearchController(searchResultsController:nil)
    private let header=UIStackView(),notice=UILabel(),descriptionLabel=UILabel()
    private var stages:UISegmentedControl?
    private var statusText=""
    var route:Data {(try? JSONEncoder().encode(place)) ?? Data()}
    init(route:Route,state:ScreenState=ScreenState(),prepared:Content?=nil) {
        place=route;self.state=state
        content=prepared ?? Content(title:route.title.isEmpty ? route.screen.rawValue.capitalized:route.title,sections:[])
        super.init(style:.insetGrouped)
        title=content.title
    }
    required init?(coder:NSCoder){fatalError("init(coder:)")}
    override var supportedInterfaceOrientations:UIInterfaceOrientationMask{.allButUpsideDown}
    override func viewDidLoad() {
        super.viewDidLoad()
        tableView.backgroundColor = .systemGroupedBackground
        tableView.register(TraderCell.self,forCellReuseIdentifier:"row")
        tableView.rowHeight=UITableView.automaticDimension;tableView.estimatedRowHeight=130
        tableView.keyboardDismissMode = .onDrag
        tableView.accessibilityIdentifier="screen.\(place.screen.rawValue)"
        refreshControl=UIRefreshControl();refreshControl?.addTarget(self,action:#selector(pullRefresh),for:.valueChanged)
        if ![.more,.connection].contains(place.screen) {
            search.searchResultsUpdater=self;search.obscuresBackgroundDuringPresentation=false
            search.searchBar.placeholder="Search \(content.title.lowercased())";search.searchBar.text=state.query
            navigationItem.searchController=search;navigationItem.hidesSearchBarWhenScrolling=state.query.isEmpty
        }
        configuringSearch=false
        if place.screen == .rankings {
            let control=UISegmentedControl(items:["Capital demo","Virtual","Backtest"])
            control.selectedSegmentIndex=["capital","virtual","backtest"].firstIndex(of:place.stage) ?? 0
            control.addTarget(self,action:#selector(stageChanged(_:)),for:.valueChanged);control.accessibilityIdentifier="ranking.stage"
            stages=control;header.addArrangedSubview(control)
            updateSortingMenu()
        }
        header.axis = .vertical;header.spacing=12;header.isLayoutMarginsRelativeArrangement=true
        header.layoutMargins=UIEdgeInsets(top:12,left:20,bottom:8,right:20)
        descriptionLabel.font = .preferredFont(forTextStyle:.subheadline);descriptionLabel.textColor = .secondaryLabel;descriptionLabel.numberOfLines=0
        notice.font = .preferredFont(forTextStyle:.caption1);notice.textColor = .secondaryLabel;notice.numberOfLines=0
        header.addArrangedSubview(descriptionLabel);header.addArrangedSubview(notice)
        tableView.tableHeaderView=header
        updateHeader()
        if content.sections.isEmpty {load(refresh:false)}
    }
    override func viewWillAppear(_ animated:Bool) {
        super.viewWillAppear(animated)
        navigationController?.setNavigationBarHidden(false,animated:false)
        navigationController?.navigationBar.prefersLargeTitles=true
        navigationItem.largeTitleDisplayMode = .automatic
    }
    override func viewDidAppear(_ animated:Bool) {
        super.viewDidAppear(animated);visible=true
        if !place.cacheKey.isEmpty {load(refresh:true)}
        startTimer()
    }
    override func viewWillDisappear(_ animated:Bool) {
        saveAnchor();super.viewWillDisappear(animated);pause()
    }
    func pause(){visible=false;timer?.invalidate();timer=nil;loadTask?.cancel();FrameMonitor.shared.scrolling(false)}
    func resumed(){guard viewIfLoaded?.window != nil else{return};visible=true;startTimer();refreshIfVisible()}
    private func startTimer(){guard timer==nil else{return};timer=Timer.scheduledTimer(withTimeInterval:30,repeats:true){[weak self] _ in Task{@MainActor in self?.refreshIfVisible()}}}
    private func refreshIfVisible(){if visible && !place.cacheKey.isEmpty{load(refresh:true)}}
    @objc private func pullRefresh(){load(refresh:true)}
    @objc private func stageChanged(_ sender:UISegmentedControl) {
        place.stage=["capital","virtual","backtest"][sender.selectedSegmentIndex]
        if place.stage=="capital" && state.sort==3 {state.sort=0}
        updateSortingMenu()
        deferred=nil;deferredStatus=nil
        if place.stage != "virtual" {place.scenario=nil}
        state.anchorKey=nil;state.atTop=true;restored=true
        content.sections=[];tableView.reloadData();tableView.setContentOffset(CGPoint(x:0,y:-tableView.adjustedContentInset.top),animated:false)
        load(refresh:true);stateChanged()
    }
    private func updateSortingMenu(){
        let labels=["Return","Sharpe","Closed trades"]+(place.stage=="capital" ? []:["Excess vs hold"])
        let actions=labels.enumerated().map { i,label in UIAction(title:label,state:state.sort==i ? .on:.off){[weak self] _ in self?.changeSort(i)} }
        navigationItem.rightBarButtonItem=UIBarButtonItem(title:"Sort",image:UIImage(systemName:"arrow.up.arrow.down"),menu:UIMenu(children:actions))
    }
    private func changeSort(_ value:Int){deferred=nil;deferredStatus=nil;state.sort=value;updateSortingMenu();state.anchorKey=nil;state.atTop=true;load(refresh:false);stateChanged()}
    func updateSearchResults(for searchController:UISearchController) {
        let query=searchController.searchBar.text ?? ""
        guard !configuringSearch,query != state.query else{return}
        deferred=nil;deferredStatus=nil
        state.query=query;state.anchorKey=nil;state.atTop=true
        navigationItem.hidesSearchBarWhenScrolling=state.query.isEmpty
        load(refresh:false,debounce:true);stateChanged()
    }
    func load(refresh:Bool,debounce:Bool=false) {
        loadTask?.cancel()
        let current=place,saved=state
        loadTask=Task { [weak self] in
            if debounce {try? await Task.sleep(for:.milliseconds(180))}
            guard !Task.isCancelled else{return}
            do {
                let result=try await TraderStore.shared.content(current,state:saved,refresh:refresh)
                guard !Task.isCancelled,let self,self.place==current else{return}
                self.statusText=""
                self.refreshControl?.endRefreshing()
                if self.tableView.isDragging || self.tableView.isDecelerating {self.deferred=result;self.deferredStatus=""}
                else {self.apply(result)}
            } catch {
                guard !Task.isCancelled,let self else{return}
                let message=error is TraderError && (error as? TraderError) == .pairing ? "Pair this iPhone in Explore → Connection." : "Offline · showing this phone’s saved records."
                AppDiagnostics.save(route:self.place,content:self.content,phase:"offline")
                self.refreshControl?.endRefreshing()
                if self.tableView.isDragging || self.tableView.isDecelerating {self.deferredStatus=message}
                else {self.statusText=message;self.updateHeader()}
            }
        }
    }
    private func apply(_ next:Content) {
        FrameMonitor.shared.measure("trader.list.apply") {
            let anchor=currentAnchor()
            let changed=next.renderID != content.renderID
            content=next;title=next.title;updateHeader();if changed{tableView.reloadData()}
            AppDiagnostics.save(route:place,content:next,phase:next.refreshed>0 ? "live":"local")
            if changed,restored,let anchor {restore(anchor)}
        }
    }
    private func updateHeader() {
        guard isViewLoaded else{return}
        descriptionLabel.text=content.subtitle
        notice.text=statusText.isEmpty ? (content.refreshed>0 ? "Updated \(Presentation.date(content.refreshed)) · pull to refresh" : place.cacheKey.isEmpty ? "":"Loading your platform…") : statusText
        descriptionLabel.isHidden=content.subtitle.isEmpty;notice.isHidden=(notice.text ?? "").isEmpty
        layoutHeader()
        if content.sections.isEmpty && content.refreshed>0 {
            let label=UILabel();label.text=state.query.isEmpty ? "No records yet.":"No matching records.";label.textColor = .secondaryLabel;label.textAlignment = .center;tableView.backgroundView=label
        } else {tableView.backgroundView=nil}
    }
    private func layoutHeader() {
        let width=tableView.bounds.width
        guard width>0 else{return}
        let size=header.systemLayoutSizeFitting(CGSize(width:width,height:UIView.layoutFittingCompressedSize.height),withHorizontalFittingPriority:.required,verticalFittingPriority:.fittingSizeLevel)
        if abs(header.frame.height-size.height)>0.5 || header.frame.width != width {header.frame=CGRect(x:0,y:0,width:width,height:size.height);tableView.tableHeaderView=header}
    }
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews();layoutHeader()
        if !restored && !content.sections.isEmpty {
            restored=true
            if !state.atTop,let key=state.anchorKey {restore(ScrollAnchor(key:key,fraction:state.anchorFraction))}
        }
    }
    override func viewWillTransition(to size:CGSize,with coordinator:UIViewControllerTransitionCoordinator) {
        let atTop=tableView.contentOffset.y <= -tableView.adjustedContentInset.top+8
        let anchor=atTop ? nil:currentAnchor()
        super.viewWillTransition(to:size,with:coordinator)
        coordinator.animate(alongsideTransition:{[weak self] _ in self?.layoutHeader()},completion:{[weak self] _ in
            guard let self else{return}
            if atTop{tableView.setContentOffset(CGPoint(x:0,y:-tableView.adjustedContentInset.top),animated:false)}
            else if let anchor {restore(anchor)}
            saveAnchor()
        })
    }
    override func numberOfSections(in tableView:UITableView)->Int{content.sections.count}
    override func tableView(_ tableView:UITableView,numberOfRowsInSection section:Int)->Int{content.sections[section].rows.count}
    override func tableView(_ tableView:UITableView,titleForHeaderInSection section:Int)->String?{content.sections[section].title}
    override func tableView(_ tableView:UITableView,cellForRowAt indexPath:IndexPath)->UITableViewCell {
        let cell=tableView.dequeueReusableCell(withIdentifier:"row",for:indexPath) as! TraderCell
        cell.configure(content.sections[indexPath.section].rows[indexPath.row]);return cell
    }
    override func tableView(_ tableView:UITableView,didSelectRowAt indexPath:IndexPath) {
        tableView.deselectRow(at:indexPath,animated:true)
        let row=content.sections[indexPath.section].rows[indexPath.row]
        if let route=row.route {
            if route.screen == .external {
                guard let url=URL(string:route.id),["https","http"].contains(url.scheme?.lowercased() ?? "") else{return}
                saveAnchor();UIApplication.shared.open(url)
            } else {saveAnchor();liveNavigation?.open(ScreenController(route:route))}
        } else if row.action=="pair" {pair()}
        else if row.action=="refresh" {load(refresh:true)}
        else if row.action.hasPrefix("mirror:") || row.action.hasPrefix("exclude:") {confirm(row.action)}
    }
    private func confirm(_ action:String) {
        let excluding=action.hasPrefix("exclude:")
        let enable=excluding ? action.hasPrefix("exclude:false:"):action.hasSuffix("on")
        let title=excluding ? (enable ? "Allow this demo strategy?":"Exclude this demo strategy?"):(enable ? "Resume Capital demo orders?":"Pause Capital demo orders?")
        let alert=UIAlertController(title:title,message:"This changes the demo broker mirror. Virtual testing and tick recording continue.",preferredStyle:.alert)
        alert.addAction(UIAlertAction(title:"Cancel",style:.cancel))
        let button=excluding ? (enable ? "Allow strategy":"Exclude strategy"):(enable ? "Resume demo":"Pause demo")
        alert.addAction(UIAlertAction(title:button,style:enable ? .default:.destructive){[weak self] _ in
            Task{@MainActor in do{try await TraderStore.shared.mutate(action);self?.load(refresh:true)}catch{self?.statusText="Could not confirm the change. Refresh before retrying.";self?.updateHeader()}}
        });present(alert,animated:true)
    }
    private func pair() {
        let alert=UIAlertController(title:"Connect to Trader",message:"Use your dedicated device key. Account passwords are never needed here.",preferredStyle:.alert)
        alert.addTextField{$0.placeholder="https://trader.veron3.space";$0.text="https://trader.veron3.space";$0.keyboardType = .URL;$0.autocapitalizationType = .none}
        alert.addTextField{$0.placeholder="Device key";$0.isSecureTextEntry=true;$0.autocapitalizationType = .none;$0.autocorrectionType = .no}
        alert.addAction(UIAlertAction(title:"Cancel",style:.cancel))
        alert.addAction(UIAlertAction(title:"Connect",style:.default){[weak self,weak alert] _ in
            let server=alert?.textFields?.first?.text ?? "",token=alert?.textFields?.last?.text ?? ""
            Task{@MainActor in do{try await TraderStore.shared.pair(server:server,token:token);self?.statusText="Device connection saved securely."}catch{self?.statusText="Use an HTTPS server and a valid device key."};self?.updateHeader()}
        });present(alert,animated:true)
    }
    private func currentAnchor()->ScrollAnchor? {
        guard isViewLoaded else{return nil}
        let items=(tableView.indexPathsForVisibleRows ?? []).compactMap { p -> (key:String,frame:CGRect)? in
            guard content.sections.indices.contains(p.section),content.sections[p.section].rows.indices.contains(p.row) else{return nil}
            return (content.sections[p.section].rows[p.row].id,tableView.rectForRow(at:p))
        }
        return ScrollAnchoring.anchor(in:tableView,items:items)
    }
    private func restore(_ anchor:ScrollAnchor) {
        for (s,section) in content.sections.enumerated() {
            if let r=section.rows.firstIndex(where:{$0.id==anchor.key}) {
                let p=IndexPath(row:r,section:s)
                tableView.scrollToRow(at:p,at:.middle,animated:false);tableView.layoutIfNeeded()
                ScrollAnchoring.restore(anchor,in:tableView,frame:tableView.rectForRow(at:p));break
            }
        }
    }
    private func saveAnchor() {
        guard isViewLoaded,restored,visible else{return}
        state.atTop=tableView.contentOffset.y <= -tableView.adjustedContentInset.top+8
        if let a=currentAnchor(){state.anchorKey=a.key;state.anchorFraction=a.fraction}
        stateChanged()
    }
    func savedState()->Data?{try? JSONEncoder().encode(state)}
    override func scrollViewWillBeginDragging(_ scrollView:UIScrollView){FrameMonitor.shared.scrolling(true)}
    override func scrollViewDidScroll(_ scrollView:UIScrollView){guard restored,visible else{return};let now=CACurrentMediaTime();if now-lastSave>0.25{lastSave=now;saveAnchor()}}
    override func scrollViewDidEndDragging(_ scrollView:UIScrollView,willDecelerate decelerate:Bool){if !decelerate{settled()}}
    override func scrollViewDidEndDecelerating(_ scrollView:UIScrollView){settled()}
    private func settled(){FrameMonitor.shared.scrolling(false);saveAnchor();if let message=deferredStatus{statusText=message;deferredStatus=nil};if let next=deferred{deferred=nil;apply(next)}else{updateHeader()}}
    func debug()->[String:Any]{["screen":place.screen.rawValue,"id":place.id,"stage":place.stage,"rows":content.sections.reduce(0){$0+$1.rows.count},"query":state.query,"anchor":state.anchorKey ?? "","refreshed":content.refreshed,"width":view.bounds.width,"height":view.bounds.height,"offset":tableView.contentOffset.y]}
}
