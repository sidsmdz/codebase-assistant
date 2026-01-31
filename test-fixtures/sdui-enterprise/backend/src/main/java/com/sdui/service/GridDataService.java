package com.sdui.service;

import com.sdui.repository.GridDataRepository;
import com.sdui.model.GridConfig;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class GridDataService {

    @Autowired
    private GridDataRepository gridDataRepository;

    public GridPage fetchGridData(String gridId, int page, int size, String sortField, String sortDirection) {
        GridConfig config = gridDataRepository.findGridConfig(gridId);
        if (config == null) {
            throw new IllegalArgumentException("Grid not found: " + gridId);
        }
        return gridDataRepository.findByGridId(gridId, page, size, sortField, sortDirection);
    }

    public GridPage sortGridData(String gridId, String sortField, String sortDirection) {
        return gridDataRepository.findByGridId(gridId, 0, 50, sortField, sortDirection);
    }

    public void updateCell(String gridId, String rowId, String column, Object value) {
        gridDataRepository.updateCell(gridId, rowId, column, value);
    }

    public GridConfig getGridConfig(String gridId) {
        return gridDataRepository.findGridConfig(gridId);
    }

    public List<String> getAvailableGrids(String screenId) {
        return gridDataRepository.findGridIdsByScreen(screenId);
    }
}
