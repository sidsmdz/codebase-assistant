package com.sdui.util;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public abstract class Observable {

    private static final Logger logger = LoggerFactory.getLogger(Observable.class);
    private final List<SideEffectObserver> observers = new ArrayList<>();

    public void addObserver(SideEffectObserver observer) {
        observers.add(observer);
    }

    public void removeObserver(SideEffectObserver observer) {
        observers.remove(observer);
    }

    protected void notifyObservers(String eventType, Map<String, Object> data) {
        logger.info("Notifying observers about event: {} with data: {}", eventType, data);
        for (SideEffectObserver observer : observers) {
            observer.onSideEffect(eventType, data);
        }
    }
}