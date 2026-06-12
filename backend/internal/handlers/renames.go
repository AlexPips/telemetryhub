package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"
	_ "telemetryhub/internal/auth"
)

// CreateRenameRequest represents a create rename request.
type CreateRenameRequest struct {
	RawField    string  `json:"raw_field"`
	DisplayName *string `json:"display_name"`
	Unit        *string `json:"unit"`
	ChartGroup  *string `json:"chart_group"`
}

// UpdateRenameRequest represents an update rename request.
type UpdateRenameRequest struct {
	DisplayName *string `json:"display_name"`
	Unit        *string `json:"unit"`
	ChartGroup  *string `json:"chart_group"`
}

// RenameHandler handles field rename endpoints.
type RenameHandler struct {
	store DeviceStore
}

// NewRenameHandler creates a new rename handler.
func NewRenameHandler(store DeviceStore) *RenameHandler {
	return &RenameHandler{store: store}
}

// CreateRename    Create field rename (admin only)
// @Summary      Create field rename
// @Description  Creates a new field rename configuration for a device. The display_name and unit are used in chart labels. Requires admin role.
// @Tags         renames
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id      path string                    true  "Device ID"
// @Param        request body handlers.CreateRenameRequest true  "Rename configuration"
// @Success      201 {object} auth.MessageResponse
// @Failure      400 {object} auth.ErrorResponse
// @Failure      401 {object} auth.ErrorResponse
// @Failure      403 {object} auth.ErrorResponse
// @Failure      500 {object} auth.ErrorResponse
// @Router       /devices/{id}/renames [post]
func (h *RenameHandler) CreateRename(c echo.Context) error {
	deviceID := c.Param("id")
	var req struct {
		RawField    string  `json:"raw_field"`
		DisplayName *string `json:"display_name"`
		Unit        *string `json:"unit"`
		ChartGroup  *string `json:"chart_group"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
	}
	if req.RawField == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "raw_field is required"})
	}

	if err := h.store.CreateRename(c.Request().Context(), deviceID, req.RawField, req.DisplayName, req.Unit, req.ChartGroup); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to create rename"})
	}
	return c.JSON(http.StatusCreated, map[string]string{"message": "Rename created"})
}

// ListRenames     List field renames
// @Summary      List field renames
// @Description  Returns all field rename configurations for a device.
// @Tags         renames
// @Produce      json
// @Security     BearerAuth
// @Param        id path string true "Device ID"
// @Success      200 {object} []handlers.FieldRename
// @Failure      401 {object} auth.ErrorResponse
// @Failure      500 {object} auth.ErrorResponse
// @Router       /devices/{id}/renames [get]
func (h *RenameHandler) ListRenames(c echo.Context) error {
	deviceID := c.Param("id")
	renames, err := h.store.ListRenames(c.Request().Context(), deviceID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to fetch renames"})
	}
	if renames == nil {
		renames = []FieldRename{}
	}
	return c.JSON(http.StatusOK, renames)
}

// UpdateRename    Update field rename (admin only)
// @Summary      Update field rename
// @Description  Updates an existing field rename configuration. Requires admin role.
// @Tags         renames
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path string true  "Device ID"
// @Param        field path string true  "Raw field name"
// @Param        request body handlers.UpdateRenameRequest true  "Updated rename configuration"
// @Success      200 {object} auth.MessageResponse
// @Failure      400 {object} auth.ErrorResponse
// @Failure      401 {object} auth.ErrorResponse
// @Failure      403 {object} auth.ErrorResponse
// @Failure      500 {object} auth.ErrorResponse
// @Router       /devices/{id}/renames/{field} [put]
func (h *RenameHandler) UpdateRename(c echo.Context) error {
	deviceID := c.Param("id")
	rawField := c.Param("field")
	var req struct {
		DisplayName *string `json:"display_name"`
		Unit        *string `json:"unit"`
		ChartGroup  *string `json:"chart_group"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
	}

	if err := h.store.UpdateRename(c.Request().Context(), deviceID, rawField, req.DisplayName, req.Unit, req.ChartGroup); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to update rename"})
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "Rename updated"})
}

// DeleteRename    Delete field rename (admin only)
// @Summary      Delete field rename
// @Description  Deletes a field rename configuration. Readings will fall back to raw field names. Requires admin role.
// @Tags         renames
// @Produce      json
// @Security     BearerAuth
// @Param        id    path string true "Device ID"
// @Param        field path string true "Raw field name"
// @Success      200 {object} auth.MessageResponse
// @Failure      401 {object} auth.ErrorResponse
// @Failure      403 {object} auth.ErrorResponse
// @Failure      500 {object} auth.ErrorResponse
// @Router       /devices/{id}/renames/{field} [delete]
func (h *RenameHandler) DeleteRename(c echo.Context) error {
	deviceID := c.Param("id")
	rawField := c.Param("field")
	if err := h.store.DeleteRename(c.Request().Context(), deviceID, rawField); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to delete rename"})
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "Rename deleted"})
}
