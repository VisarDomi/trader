import UIKit
import KitCore
import KitNavigation
import KitLifecycle
import KitTestHooks

@main @MainActor
final class AppDelegate:UIResponder,UIApplicationDelegate {
    func application(_ application:UIApplication,configurationForConnecting session:UISceneSession,options:UIScene.ConnectionOptions)->UISceneConfiguration {
        let c=UISceneConfiguration(name:nil,sessionRole:session.role);c.delegateClass=SceneDelegate.self;return c
    }
    func application(_ application:UIApplication,supportedInterfaceOrientationsFor window:UIWindow?)->UIInterfaceOrientationMask{.allButUpsideDown}
}

@MainActor
final class TraderTabs:UITabBarController,UITabBarControllerDelegate {
    private let writer=BackgroundWriter(url:AppFiles.root.appendingPathComponent("app-state.json"),label:"trader-ui-state")
    init(startup:Startup) {
        super.init(nibName:nil,bundle:nil)
        let labels=["Rankings","Agents","Accounts","Explore"],icons=["chart.bar.xaxis","person.3.sequence","building.columns","square.grid.2x2"]
        viewControllers=AppFiles.roots.enumerated().map { i,root in
            let factory:LiveNavigationController.Factory={data,state in
                guard let route=try? JSONDecoder().decode(Route.self,from:data) else{return nil}
                let s=state.flatMap{try? JSONDecoder().decode(ScreenState.self,from:$0)} ?? ScreenState()
                return ScreenController(route:route,state:s,prepared:startup.contents[AppFiles.key(route,s)])
            }
            let nav=LiveNavigationController(file:AppFiles.navigation(i),factory:factory,root:ScreenController(route:root,prepared:startup.contents[AppFiles.key(root,ScreenState())]))
            nav.tabBarItem=UITabBarItem(title:labels[i],image:UIImage(systemName:icons[i]),tag:i)
            nav.navigationBar.tintColor = .systemTeal
            return nav
        }
        selectedIndex=min(max(startup.state.selectedTab,0),3)
        tabBar.tintColor = .systemTeal;delegate=self
    }
    required init?(coder:NSCoder){fatalError("init(coder:)")}
    var current:ScreenController?{(selectedViewController as? UINavigationController)?.topViewController as? ScreenController}
    func tabBarController(_ tabBarController:UITabBarController,didSelect viewController:UIViewController){writer.save(json:AppState(selectedTab:selectedIndex))}
    func choose(_ index:Int){guard (0..<4).contains(index) else{return};selectedIndex=index;writer.save(json:AppState(selectedTab:index))}
    func flush(){for nav in viewControllers ?? []{(nav as? LiveNavigationController)?.flush()};writer.save(json:AppState(selectedTab:selectedIndex));writer.flush()}
    func pause(){current?.pause()}
    func resume(){current?.resumed()}
}

@MainActor
final class SceneDelegate:UIResponder,UIWindowSceneDelegate {
    var window:UIWindow?
    private var tabs:TraderTabs?
    func scene(_ scene:UIScene,willConnectTo session:UISceneSession,options:UIScene.ConnectionOptions) {
        guard let scene=scene as? UIWindowScene else{return}
        Task{@MainActor in
            let startup=await TraderStore.shared.bootstrap()
            TraderFonts.prepare()
            let tabs=TraderTabs(startup:startup),window=UIWindow(windowScene:scene)
            self.tabs=tabs;self.window=window
            window.tintColor = .systemTeal;window.backgroundColor = .systemGroupedBackground
            window.rootViewController=tabs
            _=FrameMonitor.shared
            DebugState.shared.register("trader"){[weak tabs] in tabs?.current?.debug() ?? [:]}
            AppLifecycle.shared.onResignActive{[weak tabs] in tabs?.flush();DebugState.shared.write(to:AppFiles.root)}
            AppLifecycle.shared.onBackground{[weak tabs] in
                tabs?.pause()
                let task=UIApplication.shared.beginBackgroundTask(withName:"Save Trader cache")
                Task{@MainActor in await TraderStore.shared.flush();UIApplication.shared.endBackgroundTask(task)}
            }
            AppLifecycle.shared.onActive{[weak tabs] _ in tabs?.resume()}
            #if targetEnvironment(simulator)
            TestHooks.shared.back={ [weak tabs] in _=(tabs?.selectedViewController as? UINavigationController)?.popViewController(animated:false) }
            TestHooks.shared.forward={ [weak tabs] in (tabs?.selectedViewController as? LiveNavigationController)?.goForward(animated:false) }
            TestHooks.shared.register("tab"){[weak tabs] q in tabs?.choose(Int(q["index"] ?? "0") ?? 0);return ["ok":true]}
            TestHooks.shared.register("open"){[weak tabs] q in
                guard let raw=q["screen"],let screen=Screen(rawValue:raw) else{return ["ok":false]}
                (tabs?.selectedViewController as? LiveNavigationController)?.open(ScreenController(route:Route(screen:screen,id:q["id"] ?? "",stage:q["stage"] ?? "capital",version:q["version"] ?? "")),animated:false)
                return ["ok":true]
            }
            TestHooks.shared.register("orientation"){ q in
                scene.requestGeometryUpdate(.iOS(interfaceOrientations:q["value"]=="landscape" ? .landscapeRight:.portrait))
                return ["ok":true]
            }
            TestHooks.shared.register("offline"){q in Task{await TraderStore.shared.setOffline(q["value"]=="true")};return ["ok":true]}
            TestHooks.shared.register("refresh"){[weak tabs] _ in tabs?.current?.load(refresh:true);return ["ok":true]}
            TestHooks.shared.register("top"){[weak tabs] _ in
                if let table=tabs?.current?.tableView {table.setContentOffset(CGPoint(x:0,y:-table.adjustedContentInset.top),animated:false)}
                return ["ok":true]
            }
            TestHooks.shared.start()
            #endif
            window.makeKeyAndVisible()
        }
    }
}
