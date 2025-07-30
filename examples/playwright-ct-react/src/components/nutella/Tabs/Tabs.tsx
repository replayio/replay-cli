import { useState } from 'react';
import { motion } from 'framer-motion';

type Tab = { id: string; label: string };

function Tabs({ tabs }: { tabs: Tab[] }) {
  const [activeTab, setActiveTab] = useState(tabs[0].id);

  return (
    <div className="flex space-x-1 p-1 bg-muted rounded-full" data-testid="tabs-container">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          data-testid={`tab-${tab.id}`}
          data-active={activeTab === tab.id}
          className={`${
            activeTab === tab.id 
              ? "text-primary-foreground" 
              : "text-muted-foreground hover:text-foreground"
          } relative rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 z-20`}
          style={{
            WebkitTapHighlightColor: "transparent",
          }}
        >
          {activeTab === tab.id && (
            <motion.span
              layoutId="bubble"
              className="absolute inset-0 bg-primary rounded-full shadow-sm"
              transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
            />
          )}
          <span className="relative z-10">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

export default Tabs; 