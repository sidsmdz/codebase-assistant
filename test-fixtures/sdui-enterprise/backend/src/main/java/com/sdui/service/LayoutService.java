package com.sdui.service;

import com.sdui.registry.ComponentRegistry;
import com.sdui.event.EventProcessor;
import com.sdui.model.LayoutDefinition;
import io.grpc.stub.StreamObserver;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class LayoutService {

    @Autowired
    private ComponentRegistry componentRegistry;

    @Autowired
    private EventProcessor eventProcessor;

    private final Map<String, List<StreamObserver<LayoutUpdate>>> layoutObservers = new ConcurrentHashMap<>();

    public LayoutDefinition buildLayout(String screenId) {
        List<ComponentDefinition> components = componentRegistry.getComponentsForScreen(screenId);
        LayoutDefinition layout = new LayoutDefinition();
        layout.setScreenId(screenId);
        layout.setComponents(components);
        layout.setTitle(componentRegistry.getScreenTitle(screenId));
        layout.setTheme(componentRegistry.getScreenTheme(screenId));
        return layout;
    }

    public ActionResult processAction(ActionRequest request) {
        ActionResult result = eventProcessor.processAction(request);
        broadcastLayoutUpdate(request.getScreenId(), result);
        return result;
    }

    public void registerLayoutObserver(String screenId, StreamObserver<LayoutUpdate> observer) {
        layoutObservers.computeIfAbsent(screenId, k -> new CopyOnWriteArrayList<>()).add(observer);
    }

    private void broadcastLayoutUpdate(String screenId, ActionResult result) {
        List<StreamObserver<LayoutUpdate>> observers = layoutObservers.get(screenId);
        if (observers != null) {
            LayoutUpdate update = new LayoutUpdate(result.getType(), screenId);
            for (StreamObserver<LayoutUpdate> observer : observers) {
                try {
                    observer.onNext(update);
                } catch (Exception e) {
                    observers.remove(observer);
                }
            }
        }
    }
}
