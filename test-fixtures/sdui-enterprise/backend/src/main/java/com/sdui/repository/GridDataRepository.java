package com.sdui.repository;

import com.sdui.model.GridConfig;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface GridDataRepository extends JpaRepository<GridConfig, String> {

    GridConfig findGridConfig(String gridId);

    @Query("SELECT g FROM GridConfig g WHERE g.screenId = :screenId")
    List<String> findGridIdsByScreen(String screenId);

    GridPage findByGridId(String gridId, int page, int size, String sortField, String sortDirection);

    void updateCell(String gridId, String rowId, String column, Object value);

    @Query("SELECT g FROM GridConfig g WHERE g.active = true")
    List<GridConfig> findAllActiveGrids();

    @Query("SELECT COUNT(g) FROM GridConfig g WHERE g.screenId = :screenId")
    long countGridsByScreen(String screenId);
}
