import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { C, F, rgba } from "../theme";
import { PortfolioScreen } from "../screens/PortfolioScreen";
import { PositionDetailScreen } from "../screens/PositionDetailScreen";
import { DeskScreen } from "../screens/DeskScreen";
import { AnalystDetailScreen } from "../screens/AnalystDetailScreen";
import { AgentTransactionsScreen } from "../screens/AgentTransactionsScreen";
import { MarketCheckScreen } from "../screens/MarketCheckScreen";
import { PickDetailScreen } from "../screens/PickDetailScreen";
import { SessionPicksScreen } from "../screens/SessionPicksScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { MarketsScreen } from "../screens/MarketsScreen";
import { MarketsCustomizeScreen } from "../screens/MarketsCustomizeScreen";
import { MarketDetailScreen } from "../screens/MarketDetailScreen";
import { PortfolioIcon, AnalystsIcon, LiveIcon, MarketsIcon } from "./TabIcons";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const RootStack = createNativeStackNavigator();

// Portfolio tab is a native stack so tapping a position pushes its detail page.
function PortfolioStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
      <Stack.Screen name="PortfolioHome" component={PortfolioScreen} />
      <Stack.Screen name="PositionDetail" component={PositionDetailScreen} />
    </Stack.Navigator>
  );
}

// Markets tab: list → detail, plus the customize picker, all in one native stack.
function MarketsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
      <Stack.Screen name="MarketsHome" component={MarketsScreen} />
      <Stack.Screen name="MarketDetail" component={MarketDetailScreen} />
      <Stack.Screen name="MarketsCustomize" component={MarketsCustomizeScreen} />
    </Stack.Navigator>
  );
}

// The Live tab is a native stack so tapping an analyst's pick pushes its drill-down.
function LiveStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
      <Stack.Screen name="MarketCheckHome" component={MarketCheckScreen} />
      <Stack.Screen name="PickDetail" component={PickDetailScreen} />
      <Stack.Screen name="SessionPicks" component={SessionPicksScreen} />
    </Stack.Navigator>
  );
}

// The Analysts tab is its own native stack so tapping a roster card pushes the
// scorecard with a real iOS slide transition + edge swipe-back.
function AnalystsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
      <Stack.Screen name="Desk" component={DeskScreen} />
      <Stack.Screen name="AnalystDetail" component={AnalystDetailScreen} />
      <Stack.Screen name="AgentTransactions" component={AgentTransactionsScreen} />
    </Stack.Navigator>
  );
}

// The tab bar lives inside a root stack so the Profile/Account page can be pushed
// ABOVE the tabs — a full-screen page with no bottom tab bar, per the handoff.
function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.gain,
        tabBarInactiveTintColor: rgba("#FFFFFF", 0.4),
        tabBarStyle: {
          backgroundColor: "rgba(10,10,16,0.96)",
          borderTopColor: C.hair,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontFamily: F.ui600, fontSize: 10 },
        sceneStyle: { backgroundColor: C.bg },
      }}
    >
      <Tab.Screen
        name="Portfolio"
        component={PortfolioStack}
        options={{ tabBarIcon: ({ color }) => <PortfolioIcon color={color} /> }}
        listeners={({ navigation }) => ({
          tabPress: () => navigation.navigate("Portfolio", { screen: "PortfolioHome" }),
        })}
      />
      <Tab.Screen
        name="Markets"
        component={MarketsStack}
        options={{ tabBarIcon: ({ color }) => <MarketsIcon color={color} /> }}
        listeners={({ navigation }) => ({
          tabPress: () => navigation.navigate("Markets", { screen: "MarketsHome" }),
        })}
      />
      <Tab.Screen
        name="Analysts"
        component={AnalystsStack}
        options={{ tabBarIcon: ({ color }) => <AnalystsIcon color={color} /> }}
        listeners={({ navigation }) => ({
          // Tapping the tab always returns to the roster, matching the prototype.
          tabPress: () => navigation.navigate("Analysts", { screen: "Desk" }),
        })}
      />
      <Tab.Screen
        name="Live"
        component={LiveStack}
        options={{ tabBarIcon: ({ color }) => <LiveIcon color={color} /> }}
        listeners={({ navigation }) => ({
          tabPress: () => navigation.navigate("Live", { screen: "MarketCheckHome" }),
        })}
      />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
      <RootStack.Screen name="Tabs" component={Tabs} />
      <RootStack.Screen name="Profile" component={ProfileScreen} options={{ presentation: "card" }} />
    </RootStack.Navigator>
  );
}
