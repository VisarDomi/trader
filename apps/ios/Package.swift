// swift-tools-version: 6.2
import PackageDescription
let package=Package(name:"TraderLogic",platforms:[.macOS(.v15),.iOS(.v26)],products:[.library(name:"TraderLogic",targets:["TraderLogic"])],targets:[
    .target(name:"TraderLogic",path:"TraderApp",exclude:["App.swift","Store.swift","TraderCell.swift","ScreenController.swift"],sources:["Logic.swift"]),
    .testTarget(name:"TraderLogicTests",dependencies:["TraderLogic"],path:"Tests")
])
