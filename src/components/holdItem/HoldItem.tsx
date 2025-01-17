// @ts-nocheck
import React, { memo, useEffect, useMemo } from 'react';
import { TouchableWithoutFeedback, View, ViewProps } from 'react-native';

//#region reanimated & gesture handler
import {
  TapGestureHandler,
  LongPressGestureHandler,
  TapGestureHandlerGestureEvent,
  LongPressGestureHandlerGestureEvent,
} from 'react-native-gesture-handler';
import Animated, {
  measure,
  runOnJS,
  useAnimatedGestureHandler,
  useAnimatedProps,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  withSequence,
  withSpring,
  useAnimatedReaction,
} from 'react-native-reanimated';
//#endregion

//#region dependencies
import { Portal } from '@gorhom/portal';
import { nanoid } from 'nanoid/non-secure';
import ReactNativeHapticFeedback, {
  HapticFeedbackTypes,
} from 'react-native-haptic-feedback';
//#endregion

//#region utils & types
import {
  TransformOriginAnchorPosition,
  getTransformOrigin,
  calculateMenuHeight,
} from '../../utils/calculations';
import {
  HOLD_ITEM_TRANSFORM_DURATION,
  HOLD_ITEM_SCALE_DOWN_DURATION,
  HOLD_ITEM_SCALE_DOWN_VALUE,
  SPRING_CONFIGURATION,
  WINDOW_HEIGHT,
  WINDOW_WIDTH,
  CONTEXT_MENU_STATE,
  HOLD_ITEM_HIDE_DURATION,
} from '../../constants';
import { useDeviceOrientation } from '../../hooks';
import styles from './styles';

import type {
  HoldItemProps,
  GestureHandlerProps,
  PreviewComponentProps,
} from './types';
import styleGuide from '../../styleGuide';
import { useInternal } from '../../hooks';
//#endregion

type Context = { didMeasureLayout: boolean };

type Dimensions = {
  width: number;
  height: number;
};

type Rect = {
  x: number;
  y: number;
} & Dimensions;

const DefaultPreview = ({ children }: PreviewComponentProps) => (
  <View>{children}</View>
);

const HoldItemComponent = ({
  items,
  bottom,
  containerStyles,
  disableMove,
  menuAnchorPosition,
  activateOn,
  hapticFeedback,
  actionParams,
  closeOnTap,
  longPressMinDurationMs = 150,
  children,
  previewComponent: Preview = DefaultPreview,
  anchorEdge = 'top',
}: HoldItemProps) => {
  //#region hooks
  const { state, menuProps, safeAreaInsets, setItems } = useInternal();
  const deviceOrientation = useDeviceOrientation();
  //#endregion

  //#region variables
  const isActive = useSharedValue(false);
  const isAnimationStarted = useSharedValue(false);

  const itemDimensions = useSharedValue<Dimensions>({
    width: 0,
    height: 0,
  });

  const previewRect = useSharedValue<Rect>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });

  const itemScale = useSharedValue<number>(1);

  const transformOrigin = useSharedValue<TransformOriginAnchorPosition>(
    menuAnchorPosition || 'top-right'
  );

  const key = useMemo(() => `hold-item-${nanoid()}`, []);
  const menuHeight = useMemo(() => {
    const itemsWithSeparator = items.filter(item => item.withSeparator);
    return calculateMenuHeight(items.length, itemsWithSeparator.length);
  }, [items]);

  const isHold = !activateOn || activateOn === 'hold';
  //#endregion

  //#region refs
  const containerRef = useAnimatedRef<Animated.View>();
  const previewRef = useAnimatedRef<Animated.View>();
  //#endregion

  useEffect(() => {
    setItems(items);
  }, [items, setItems]);

  //#region functions
  const hapticResponse = () => {
    const style = !hapticFeedback ? 'Medium' : hapticFeedback;
    switch (style) {
      case `Selection`:
        ReactNativeHapticFeedback.trigger(HapticFeedbackTypes.soft);
        break;
      case `Light`:
      case `Medium`:
      case `Heavy`:
        ReactNativeHapticFeedback.trigger(HapticFeedbackTypes.impactLight);
        break;
      case `Success`:
      case `Warning`:
      case `Error`:
        ReactNativeHapticFeedback.trigger(
          HapticFeedbackTypes.notificationSuccess
        );
        break;
      default:
    }
  };
  //#endregion

  //#region worklet functions
  const activateAnimation = () => {
    'worklet';

    const containerMeasures = measure(containerRef);
    const previewMeasures = measure(previewRef);

    if (!previewMeasures || !containerMeasures) {
      return;
    }

    previewRect.value = {
      x: containerMeasures.pageX,
      y: containerMeasures.pageY,
      width: previewMeasures.width,
      height: previewMeasures.height,
    };

    if (!menuAnchorPosition) {
      const position = getTransformOrigin(
        previewRect.value.x,
        previewRect.value.width,
        deviceOrientation === 'portrait' ? WINDOW_WIDTH : WINDOW_HEIGHT,
        bottom
      );
      transformOrigin.value = position;
    }
  };

  const calculateTransformValue = () => {
    'worklet';

    const height =
      deviceOrientation === 'portrait' ? WINDOW_HEIGHT : WINDOW_WIDTH;

    const isAnchorPointTop = transformOrigin.value.includes('top');

    let tY = 0;
    let y = 0;

    if (!disableMove) {
      switch (anchorEdge) {
        case 'top':
          y = previewRect.value.y;
          break;
        case 'bottom':
          let moveUp = previewRect.value.height - itemDimensions.value.height;
          y = previewRect.value.y - moveUp;
          // tY = tY + moveUp;
          break;
      }

      if (isAnchorPointTop) {
        const topEdge = y - (safeAreaInsets?.top || 0);

        if (topEdge < 0) {
          tY = -topEdge + styleGuide.spacing * 2;
        }

        const bottomEdge =
          y +
          previewRect.value.height +
          menuHeight +
          (safeAreaInsets?.bottom || 0);

        if (bottomEdge > height) {
          tY = height - bottomEdge;
        }
      } else {
        const topEdge = y - menuHeight - (safeAreaInsets?.top || 0);

        if (topEdge < 0) {
          tY = -topEdge + styleGuide.spacing * 2;
        }

        const bottomEdge =
          y + previewRect.value.height + (safeAreaInsets?.bottom || 0);

        if (bottomEdge > height) {
          tY = height - bottomEdge;
        }
      }
    }

    return { tY, y };
  };

  const setMenuProps = () => {
    'worklet';

    const { tY, y } = calculateTransformValue();

    menuProps.value = {
      itemHeight: previewRect.value.height,
      itemWidth: previewRect.value.width,
      itemY: y,
      itemX: previewRect.value.x,
      anchorPosition: transformOrigin.value,
      menuHeight: menuHeight,
      items,
      transformValue: tY,
      actionParams: actionParams || {},
    };
  };

  const scaleBack = () => {
    'worklet';
    itemScale.value = withTiming(1, {
      duration: HOLD_ITEM_TRANSFORM_DURATION / 2,
    });
  };

  const onCompletion = (isFinised?: boolean) => {
    'worklet';
    const isListValid = items && items.length > 0;
    if (isFinised && isListValid) {
      state.value = CONTEXT_MENU_STATE.ACTIVE;
      isActive.value = true;
      scaleBack();
      if (hapticFeedback !== 'None') {
        runOnJS(hapticResponse)();
      }
    }

    isAnimationStarted.value = false;

    // TODO: Warn user if item list is empty or not given
  };

  const scaleHold = () => {
    'worklet';
    itemScale.value = withTiming(
      HOLD_ITEM_SCALE_DOWN_VALUE,
      { duration: HOLD_ITEM_SCALE_DOWN_DURATION },
      onCompletion
    );
  };

  const scaleTap = () => {
    'worklet';
    isAnimationStarted.value = true;

    itemScale.value = withSequence(
      withTiming(HOLD_ITEM_SCALE_DOWN_VALUE, {
        duration: HOLD_ITEM_SCALE_DOWN_DURATION,
      }),
      withTiming(
        1,
        {
          duration: HOLD_ITEM_TRANSFORM_DURATION / 2,
        },
        onCompletion
      )
    );
  };

  const previewTap = () => {
    'worklet';

    if (closeOnTap) {
      close();
    }
  };

  const close = () => {
    'worklet';

    state.value = CONTEXT_MENU_STATE.END;
  };

  /**
   * When use tap activation ("tap") and trying to tap multiple times,
   * scale animation is called again despite it is started. This causes a bug.
   * To prevent this, it is better to check is animation already started.
   */
  const canCallActivateFunctions = () => {
    'worklet';
    const willActivateWithTap =
      activateOn === 'double-tap' || activateOn === 'tap';

    return (
      (willActivateWithTap && !isAnimationStarted.value) || !willActivateWithTap
    );
  };
  //#endregion

  //#region gesture events
  const gestureEvent = useAnimatedGestureHandler<
    LongPressGestureHandlerGestureEvent | TapGestureHandlerGestureEvent,
    Context
  >({
    onActive: (_, context) => {
      if (canCallActivateFunctions()) {
        if (!context.didMeasureLayout) {
          activateAnimation();
          setMenuProps();
          context.didMeasureLayout = true;
        }

        if (!isActive.value) {
          if (isHold) {
            scaleHold();
          } else {
            scaleTap();
          }
        }
      }
    },
    onFinish: (_, context) => {
      context.didMeasureLayout = false;
      if (isHold) {
        scaleBack();
      }
    },
  });
  //#endregion

  //#region animated styles & props
  const animatedContainerStyle = useAnimatedStyle(() => {
    const animateOpacity = () =>
      withDelay(HOLD_ITEM_TRANSFORM_DURATION, withTiming(1, { duration: 0 }));

    return {
      opacity: isActive.value ? 0 : animateOpacity(),
      transform: [
        {
          scale: isActive.value
            ? withTiming(1, { duration: HOLD_ITEM_TRANSFORM_DURATION })
            : itemScale.value,
        },
      ],
    };
  });
  const containerStyle = React.useMemo(
    () => [containerStyles, animatedContainerStyle],
    [containerStyles, animatedContainerStyle]
  );

  const animatedPortalStyle = useAnimatedStyle(() => {
    const animateOpacity = () =>
      withDelay(
        HOLD_ITEM_TRANSFORM_DURATION,
        withTiming(0, { duration: HOLD_ITEM_HIDE_DURATION })
      );

    const { y, tY } = calculateTransformValue();

    const transformAnimation = () =>
      disableMove
        ? 0
        : isActive.value
        ? withSpring(tY, SPRING_CONFIGURATION)
        : withTiming(-0.1, { duration: HOLD_ITEM_TRANSFORM_DURATION });

    return {
      top: y,
      left: previewRect.value.x,
      opacity: isActive.value ? 1 : animateOpacity(),
      transform: [
        {
          translateY: transformAnimation(),
        },
        {
          scale: isActive.value
            ? withTiming(1, { duration: HOLD_ITEM_TRANSFORM_DURATION })
            : itemScale.value,
        },
      ],
    };
  });
  const portalContainerStyle = useMemo(
    () => [styles.holdItem, animatedPortalStyle],
    [animatedPortalStyle]
  );

  const animatedPortalProps = useAnimatedProps<ViewProps>(() => ({
    pointerEvents: isActive.value ? 'auto' : 'none',
  }));

  const previewAnimatedStyle = useAnimatedStyle(() => {
    return {
      width: itemDimensions.value.width,
      height: itemDimensions.value.height,
    };
  });
  //#endregion

  //#region animated effects
  useAnimatedReaction(
    () => state.value,
    _state => {
      if (_state === CONTEXT_MENU_STATE.END) {
        isActive.value = false;
      }
    }
  );
  //#endregion

  //#region components
  const GestureHandler = useMemo(() => {
    switch (activateOn) {
      case `double-tap`:
        return ({ children: handlerChildren }: GestureHandlerProps) => (
          <TapGestureHandler
            numberOfTaps={2}
            onHandlerStateChange={gestureEvent}
          >
            {handlerChildren}
          </TapGestureHandler>
        );
      case `tap`:
        return ({ children: handlerChildren }: GestureHandlerProps) => (
          <TapGestureHandler
            numberOfTaps={1}
            onHandlerStateChange={gestureEvent}
          >
            {handlerChildren}
          </TapGestureHandler>
        );
      // default is hold
      default:
        return ({ children: handlerChildren }: GestureHandlerProps) => (
          <LongPressGestureHandler
            minDurationMs={longPressMinDurationMs}
            onHandlerStateChange={gestureEvent}
          >
            {handlerChildren}
          </LongPressGestureHandler>
        );
    }
  }, [activateOn, gestureEvent, longPressMinDurationMs]);
  //#endregion

  //#region render
  return (
    <>
      <GestureHandler>
        <Animated.View
          ref={containerRef}
          style={containerStyle}
          onLayout={event => {
            itemDimensions.value = {
              width: event.nativeEvent.layout.width,
              height: event.nativeEvent.layout.height,
            };
          }}
        >
          {children}
        </Animated.View>
      </GestureHandler>

      <Portal key={key} name={key}>
        <Animated.View
          ref={previewRef}
          key={key}
          style={portalContainerStyle}
          animatedProps={animatedPortalProps}
        >
          <TouchableWithoutFeedback onPress={previewTap}>
            <Preview close={close}>
              <Animated.View style={previewAnimatedStyle}>
                {children}
              </Animated.View>
            </Preview>
          </TouchableWithoutFeedback>
        </Animated.View>
      </Portal>
    </>
  );
  //#endregion
};

const HoldItem = memo(HoldItemComponent);

export default HoldItem;
