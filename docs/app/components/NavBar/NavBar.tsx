'use client';

import { FC, useContext } from 'react';
import { Text, Button } from '@fluentui/react-components';
import {
  WeatherMoon24Regular,
  WeatherSunny24Regular,
} from '@fluentui/react-icons';
import { FaGithub } from 'react-icons/fa';
import useStyles from './NavBar.styles';
import { ThemeContext } from '../../contexts/ThemeContext';
import Link from 'next/link';

const NavBar: FC = () => {
  const classes = useStyles();
  const { isDark, toggleTheme } = useContext(ThemeContext);

  return (
    <nav className={classes.nav}>
      <Link
        href={`/`}
        className={classes.logo}
        aria-label="Teams AI Accelerator Group"
      >
        <Text role="heading" aria-level={3} className={classes.logoText}>
          🤖 Teams AI Accelerator Group
        </Text>
      </Link>
      <div className={classes.navLinks}>
        <a
          href="https://github.com/microsoft/teams-agent-accelerator-templates"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Teams Agent Accelerator Templates GitHub repository"
          className={classes.iconLink}
        >
          <FaGithub
            className={classes.icon}
            aria-label="Github logo"
            role="img"
          />
        </a>
        <Button
          icon={isDark ? <WeatherSunny24Regular /> : <WeatherMoon24Regular />}
          appearance="subtle"
          onClick={toggleTheme}
          title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        />
      </div>
    </nav>
  );
};

NavBar.displayName = 'NavBar';

export default NavBar;
