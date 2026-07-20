package handlers

import (
	"context"
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"
)

type DeviceGroupStore interface {
	ListDeviceGroups(ctx context.Context) ([]DeviceGroup, error)
	CreateDeviceGroup(ctx context.Context, name string) (int, error)
	UpdateDeviceGroup(ctx context.Context, id int, name string) error
	DeleteDeviceGroup(ctx context.Context, id int) error
	ReorderDeviceGroups(ctx context.Context, order []int) error
	SetDeviceGroup(ctx context.Context, deviceID string, groupID *int) error
}

type DeviceGroupHandler struct {
	store DeviceGroupStore
}

func NewDeviceGroupHandler(store DeviceGroupStore) *DeviceGroupHandler {
	return &DeviceGroupHandler{store: store}
}

type createDeviceGroupRequest struct {
	Name string `json:"name"`
}

type updateDeviceGroupRequest struct {
	Name string `json:"name"`
}

type reorderDeviceGroupsRequest struct {
	Order []int `json:"order"`
}

type setDeviceGroupRequest struct {
	GroupID *int `json:"group_id"`
}

func (h *DeviceGroupHandler) List(c echo.Context) error {
	groups, err := h.store.ListDeviceGroups(c.Request().Context())
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to list groups"})
	}
	if groups == nil {
		groups = []DeviceGroup{}
	}
	return c.JSON(http.StatusOK, groups)
}

func (h *DeviceGroupHandler) Create(c echo.Context) error {
	var req createDeviceGroupRequest
	if err := c.Bind(&req); err != nil || req.Name == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Name is required"})
	}
	id, err := h.store.CreateDeviceGroup(c.Request().Context(), req.Name)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to create group"})
	}
	return c.JSON(http.StatusCreated, map[string]interface{}{"id": id, "name": req.Name})
}

func (h *DeviceGroupHandler) Update(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid group ID"})
	}
	var req updateDeviceGroupRequest
	if err := c.Bind(&req); err != nil || req.Name == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Name is required"})
	}
	if err := h.store.UpdateDeviceGroup(c.Request().Context(), id, req.Name); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to update group"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

func (h *DeviceGroupHandler) Delete(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid group ID"})
	}
	if err := h.store.DeleteDeviceGroup(c.Request().Context(), id); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to delete group"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

func (h *DeviceGroupHandler) Reorder(c echo.Context) error {
	var req reorderDeviceGroupsRequest
	if err := c.Bind(&req); err != nil || len(req.Order) == 0 {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Order array is required"})
	}
	if err := h.store.ReorderDeviceGroups(c.Request().Context(), req.Order); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to reorder groups"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

func (h *DeviceGroupHandler) SetDeviceGroup(c echo.Context) error {
	deviceID := c.Param("id")
	var req setDeviceGroupRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request"})
	}
	if err := h.store.SetDeviceGroup(c.Request().Context(), deviceID, req.GroupID); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to assign device"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}
