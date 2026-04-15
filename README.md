# What

A repo that is a framework about trading agents and how they can backtest and also do actual plays in demo accounts

# Why

It was easier to create a framework from scratch than to find a suitable framework and then suit it to my use-cases.

# How

The framework itself hot loads the agents you write in a specific folder, so the deployment of trading agents for now is just drag and drop. Then, on the ui, you can make the agent run against the backtest. Demo plays are still a WIP so that's not available now. The backtest data is formed by HLOC minute data and by tick data. The tick data is starts recording from the moment you set this repo up. 
