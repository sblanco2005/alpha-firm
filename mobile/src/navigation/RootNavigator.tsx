import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { C, F, rgba } from "../theme";
import { PortfolioScreen } from "../screens/PortfolioScreen";
import { PositionDetailScreen } from "../screens/PositionDetailScreen";
import { DeskScreen } from "../screens/DeskScreen";
import { AnalystDetailScreen } from "../screens/AnalystDetailScreen";
import { MarketCheckScreen } from "../screens/MarketCheckScreen";
import { StandingsScreen } from "../screens/StandingsScreen";
import { PortfolioIcon, AnalystsIcon, LiveIcon, LeagueIcon } from "./TabIcons";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Portfolio tab is a native stack so tapping a position pushes its detail page.
function PortfolioStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
      <Stack.Screen name="PortfolioHome" component={PortfolioScreen} />
      <Stack.Screen name="PositionDetail" component={PositionDetailScreen} />
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
    </Stack.Navigator>
  );
}

export function RootNavigator() {
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
        component={MarketCheckScreen}
        options={{ tabBarIcon: ({ color }) => <LiveIcon color={color} /> }}
      />
      <Tab.Screen
        name="League"
        component={StandingsScreen}
        options={{ tabBarIcon: ({ color }) => <LeagueIcon color={color} /> }}
      />
    </Tab.Navigator>
  );
}
