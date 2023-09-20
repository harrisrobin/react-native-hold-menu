import { createContext, Dispatch, SetStateAction } from 'react';
import { SharedValue } from 'react-native-reanimated';
import type { CONTEXT_MENU_STATE } from '../constants';
import { MenuInternalProps, MenuItemProps } from '../components/menu/types';

export type InternalContextType = {
  state: SharedValue<CONTEXT_MENU_STATE>;
  theme: SharedValue<'light' | 'dark'>;
  menuProps: SharedValue<MenuInternalProps>;
  safeAreaInsets?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  items: MenuItemProps[];
  setItems: Dispatch<SetStateAction<MenuItemProps[]>>;
};

// @ts-ignore
export const InternalContext = createContext<InternalContextType>();
