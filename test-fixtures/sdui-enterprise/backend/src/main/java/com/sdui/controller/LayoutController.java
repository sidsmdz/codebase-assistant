package com.sdui.controller;

import com.sdui.service.LayoutService;
import com.sdui.service.GridDataService;
import com.sdui.grpc.LayoutServiceGrpc;
import io.grpc.stub.StreamObserver;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@GrpcService
@RequestMapping("/api/layout")
public class LayoutController extends LayoutServiceGrpc.LayoutServiceImplBase {

    @Autowired
    private LayoutService layoutService;

    @Autowired
    private GridDataService gridDataService;

    @GetMapping("/{screenId}")
    public ResponseEntity<LayoutDefinition> getLayout(@PathVariable String screenId) {
        LayoutDefinition layout = layoutService.buildLayout(screenId);
        return ResponseEntity.ok(layout);
    }

    @PostMapping("/action")
    public ResponseEntity<ActionResult> handleAction(@RequestBody ActionRequest request) {
        ActionResult result = layoutService.processAction(request);
        return ResponseEntity.ok(result);
    }

    @GetMapping("/grid/{gridId}/data")
    public ResponseEntity<GridPage> getGridData(
            @PathVariable String gridId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) String sortField,
            @RequestParam(defaultValue = "asc") String sortDirection) {
        GridPage data = gridDataService.fetchGridData(gridId, page, size, sortField, sortDirection);
        return ResponseEntity.ok(data);
    }

    @Override
    public void getLayout(GetLayoutRequest request, StreamObserver<LayoutResponse> responseObserver) {
        LayoutDefinition layout = layoutService.buildLayout(request.getScreenId());
        LayoutResponse response = convertToProto(layout);
        responseObserver.onNext(response);
        responseObserver.onCompleted();
    }

    @Override
    public void streamLayoutUpdates(LayoutSubscription request, StreamObserver<LayoutUpdate> responseObserver) {
        layoutService.registerLayoutObserver(request.getScreenId(), responseObserver);
    }

    @Override
    public void submitAction(ActionRequest request, StreamObserver<ActionResponse> responseObserver) {
        ActionResult result = layoutService.processAction(convertFromProto(request));
        ActionResponse response = ActionResponse.newBuilder()
                .setResultType(result.getType())
                .setSuccess(true)
                .build();
        responseObserver.onNext(response);
        responseObserver.onCompleted();
    }

    private LayoutResponse convertToProto(LayoutDefinition layout) {
        return LayoutResponse.newBuilder()
                .setScreenId(layout.getScreenId())
                .setTitle(layout.getTitle())
                .build();
    }

    private com.sdui.model.ActionRequest convertFromProto(ActionRequest proto) {
        return new com.sdui.model.ActionRequest(
                proto.getActionType(), proto.getComponentId(), proto.getPayloadJson());
    }
}
